import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import * as DocumentPicker from '@react-native-documents/picker';
import * as ImagePicker from 'react-native-image-picker';
import { DocumentSourcePicker } from '@/components';
import {
  FileSelectionError,
  MAX_FILE_SIZE,
  extensionOf,
  formatFileSize,
  selectDocument,
  selectImageFromGallery,
  validateFile,
} from '@/services/files';
import { setupStore } from '@/store';
import { ThemeProvider, lightTheme } from '@/theme';

type DocMock = typeof DocumentPicker & {
  __mock: { next: unknown; lastOptions: { type?: string[] } | null };
};
type PickerMock = typeof ImagePicker & { __mock: { next: unknown } };
const docs = (DocumentPicker as DocMock).__mock;
const photos = (ImagePicker as PickerMock).__mock;

const MB = 1024 * 1024;
const pdf = {
  uri: 'content://docs/report.pdf',
  name: 'report.pdf',
  size: 2 * MB,
  mimeType: 'application/pdf',
  source: 'documents' as const,
};

beforeEach(() => {
  docs.next = null;
  docs.lastOptions = null;
  photos.next = { didCancel: true };
});

/* ------------------------------- validation ------------------------------ */

describe('validateFile', () => {
  it('accepts a well-formed PDF and normalises it', () => {
    const result = validateFile(pdf);
    expect(result).toEqual({
      ok: true,
      file: expect.objectContaining({
        kind: 'pdf',
        extension: 'pdf',
        mimeType: 'application/pdf',
        name: 'report.pdf',
        size: 2 * MB,
      }),
    });
  });

  it('accepts images with any of their extensions and MIME aliases', () => {
    for (const [name, mimeType] of [
      ['photo.jpg', 'image/jpeg'],
      ['photo.JPEG', 'image/jpg'],
      ['shot.png', 'image/png'],
      ['pic.heic', 'image/heic'],
      ['pic.webp', 'image/webp'],
    ] as const) {
      const result = validateFile({ ...pdf, name, mimeType, size: 1 * MB });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.file.kind).toBe('image');
      }
    }
  });

  it('rejects files over the per-kind limit with a readable message', () => {
    const big = validateFile({ ...pdf, size: MAX_FILE_SIZE.pdf + 1 });
    expect(big).toMatchObject({
      ok: false,
      issue: { code: 'too-large', message: expect.stringMatching(/20 MB/) },
    });
    const bigImage = validateFile({
      ...pdf,
      name: 'a.png',
      mimeType: 'image/png',
      size: MAX_FILE_SIZE.image + 1,
    });
    expect(bigImage).toMatchObject({ issue: { code: 'too-large' } });
    // A caller can tighten the limit.
    expect(validateFile(pdf, { maxSize: 1 * MB })).toMatchObject({
      issue: { code: 'too-large' },
    });
  });

  it('rejects unsupported MIME types and kinds not allowed by the caller', () => {
    expect(
      validateFile({ ...pdf, name: 'a.docx', mimeType: 'application/msword' }),
    ).toMatchObject({ issue: { code: 'unsupported-type' } });
    expect(validateFile(pdf, { kinds: ['image'] })).toMatchObject({
      issue: { code: 'unsupported-type' },
    });
  });

  it('rejects a MIME/extension mismatch and unknown extensions', () => {
    expect(
      validateFile({ ...pdf, name: 'evil.pdf', mimeType: 'image/png' }),
    ).toMatchObject({ issue: { code: 'type-mismatch' } });
    expect(
      validateFile({ ...pdf, name: 'a.exe', mimeType: 'application/pdf' }),
    ).toMatchObject({ issue: { code: 'unsupported-extension' } });
    // Falls back to the URI's extension when the name has none...
    expect(
      validateFile({ ...pdf, name: 'noext', mimeType: 'application/pdf' }),
    ).toMatchObject({ ok: true, file: { extension: 'pdf' } });
    // ...and rejects when neither carries one.
    expect(
      validateFile({
        ...pdf,
        uri: 'content://docs/42',
        name: 'noext',
        mimeType: 'application/pdf',
      }),
    ).toMatchObject({ issue: { code: 'unsupported-extension' } });
  });

  it('infers the MIME type from the extension when the platform omits it', () => {
    const result = validateFile({ ...pdf, mimeType: null });
    expect(result).toMatchObject({
      ok: true,
      file: { mimeType: 'application/pdf' },
    });
    const fromUri = validateFile({
      uri: 'file:///cache/scan%20one.JPG?x=1',
      name: null,
      mimeType: null,
      size: 1000,
      source: 'gallery',
    });
    expect(fromUri).toMatchObject({
      ok: true,
      file: { extension: 'jpg', mimeType: 'image/jpeg', name: 'file.jpg' },
    });
  });

  it('rejects empty files and unknown sizes', () => {
    expect(validateFile({ ...pdf, size: 0 })).toMatchObject({
      issue: { code: 'empty' },
    });
    expect(validateFile({ ...pdf, size: null })).toMatchObject({
      issue: { code: 'unknown-size' },
    });
  });

  it('helpers: extensionOf and formatFileSize', () => {
    expect(extensionOf('a/b/c.tar.gz')).toBe('gz');
    expect(extensionOf('.hidden')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(300 * 1024)).toBe('300 KB');
    expect(formatFileSize(2.5 * MB)).toBe('2.5 MB');
    expect(formatFileSize(15 * MB)).toBe('15 MB');
  });
});

/* -------------------------------- selection ------------------------------ */

describe('selectDocument', () => {
  it('filters the picker to the allowed MIME types and validates the pick', async () => {
    docs.next = {
      uri: 'content://x/report.pdf',
      name: 'report.pdf',
      size: 3 * MB,
      type: 'application/pdf',
      error: null,
    };
    const file = await selectDocument({ kinds: ['pdf'] });
    expect(docs.lastOptions?.type).toEqual(['application/pdf']);
    expect(file).toMatchObject({ kind: 'pdf', source: 'documents' });

    await selectDocument();
    expect(docs.lastOptions?.type).toEqual(
      expect.arrayContaining(['application/pdf', 'image/jpeg', 'image/png']),
    );
  });

  it('resolves null when the user cancels', async () => {
    docs.next = null;
    await expect(selectDocument()).resolves.toBeNull();
  });

  it('throws a typed error for invalid picks and picker failures', async () => {
    docs.next = {
      uri: 'content://x/huge.pdf',
      name: 'huge.pdf',
      size: 50 * MB,
      type: 'application/pdf',
      error: null,
    };
    await expect(selectDocument()).rejects.toMatchObject({
      name: 'FileSelectionError',
      code: 'too-large',
    });

    docs.next = Object.assign(new Error('nope'), {
      code: 'UNABLE_TO_OPEN_FILE_TYPE',
    });
    await expect(selectDocument()).rejects.toMatchObject({
      code: 'unavailable',
    });

    docs.next = new Error('boom');
    await expect(selectDocument()).rejects.toBeInstanceOf(FileSelectionError);
  });
});

describe('selectImageFromGallery', () => {
  it('validates gallery images with the image rules', async () => {
    photos.next = {
      assets: [
        {
          uri: 'file:///g/a.png',
          fileName: 'a.png',
          fileSize: 900_000,
          type: 'image/png',
          width: 100,
          height: 50,
        },
      ],
    };
    await expect(selectImageFromGallery()).resolves.toMatchObject({
      kind: 'image',
      source: 'gallery',
      width: 100,
      height: 50,
    });

    photos.next = {
      assets: [
        {
          uri: 'file:///g/a.png',
          fileName: 'a.png',
          fileSize: 11 * MB,
          type: 'image/png',
        },
      ],
    };
    await expect(selectImageFromGallery()).rejects.toMatchObject({
      code: 'too-large',
    });

    photos.next = { errorCode: 'permission' };
    await expect(selectImageFromGallery()).rejects.toMatchObject({
      code: 'permission',
    });
  });
});

/* ------------------------------- component ------------------------------- */

describe('DocumentSourcePicker', () => {
  function render(ui: React.ReactElement) {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <Provider store={setupStore()}>
          <ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>
        </Provider>,
      );
    });
    return tree;
  }
  const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
    tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
  const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType('Text' as never).map(n => {
      const c = n.props.children;
      return Array.isArray(c) ? c.join('') : String(c);
    });

  it('shows the chosen file, reports it, and can remove it', async () => {
    const onChange = jest.fn();
    const onScan = jest.fn();
    const tree = render(
      <DocumentSourcePicker onChange={onChange} onScan={onScan} />,
    );
    docs.next = {
      uri: 'content://x/report.pdf',
      name: 'report.pdf',
      size: 2 * MB,
      type: 'application/pdf',
      error: null,
    };

    await act(async () => host(tree, 'document-source-browse').props.onClick());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'report.pdf' }),
    );
    expect(texts(tree)).toContain('report.pdf');
    expect(texts(tree)).toContain('PDF · 2.0 MB');

    await act(async () =>
      host(tree, 'document-source-file-remove').props.onClick(),
    );
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(texts(tree)).toContain('Choose a PDF or image');

    await act(async () => host(tree, 'document-source-scan').props.onClick());
    expect(onScan).toHaveBeenCalled();
  });

  it('shows a validation error inline and keeps the buttons', async () => {
    const tree = render(<DocumentSourcePicker />);
    docs.next = {
      uri: 'content://x/a.docx',
      name: 'a.docx',
      size: 1000,
      type: 'application/msword',
      error: null,
    };
    await act(async () => host(tree, 'document-source-browse').props.onClick());
    expect(texts(tree).join(' ')).toMatch(/not supported/);
    expect(() => host(tree, 'document-source-browse')).not.toThrow();
  });

  it('hides the gallery button when images are not allowed', () => {
    const tree = render(<DocumentSourcePicker kinds={['pdf']} />);
    expect(texts(tree)).toContain('Choose a PDF');
    expect(() => host(tree, 'document-source-gallery')).toThrow();
  });
});
