import {
  MAX_FILE_SIZE,
  MIME_BY_EXTENSION,
  SUPPORTED_TYPES,
  extensionsFor,
  formatFileSize,
} from './fileConstraints';
import type {
  FileCandidate,
  FileKind,
  FileValidationResult,
  SelectedFile,
} from './types';

export interface ValidateFileOptions {
  /** Which kinds this call accepts. Defaults to everything supported. */
  kinds?: readonly FileKind[];
  /** Override the per-kind size limit, in bytes. */
  maxSize?: number;
}

const ALL_KINDS: FileKind[] = ['pdf', 'image'];

/** Extension from a file name or URI, lower-cased, without the dot. */
export function extensionOf(nameOrUri: string | null | undefined): string {
  if (!nameOrUri) {
    return '';
  }
  // Strip query strings and fragments, then take the last path segment.
  const clean = nameOrUri.split(/[?#]/)[0];
  const last = clean.substring(clean.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  if (dot <= 0 || dot === last.length - 1) {
    return '';
  }
  return decodeURIComponent(last.substring(dot + 1)).toLowerCase();
}

function normaliseMime(mime: string | null | undefined): string {
  if (!mime) {
    return '';
  }
  const bare = mime.split(';')[0].trim().toLowerCase();
  // Common aliases the platforms emit.
  if (bare === 'image/jpg' || bare === 'image/pjpeg') {
    return 'image/jpeg';
  }
  return bare;
}

/**
 * Checks a picked file against size, MIME type and extension rules and
 * returns a fully typed `SelectedFile`, or a user-facing issue.
 *
 * MIME and extension are validated *together*: a `.pdf` claiming to be an
 * image is rejected, and when the platform gives no MIME type at all it is
 * inferred from a known extension rather than trusted blindly.
 */
export function validateFile(
  candidate: FileCandidate,
  options: ValidateFileOptions = {},
): FileValidationResult {
  const kinds = options.kinds ?? ALL_KINDS;

  const extension = extensionOf(candidate.name) || extensionOf(candidate.uri);
  const mime =
    normaliseMime(candidate.mimeType) || MIME_BY_EXTENSION[extension] || '';

  const supported = SUPPORTED_TYPES[mime];
  if (!supported || !kinds.includes(supported.kind)) {
    return {
      ok: false,
      issue: {
        code: 'unsupported-type',
        message: `That file type is not supported. Choose a ${describeKinds(
          kinds,
        )}.`,
      },
    };
  }

  if (!extension) {
    return {
      ok: false,
      issue: {
        code: 'unsupported-extension',
        message: `The file has no extension. Supported: ${listExtensions(
          kinds,
        )}.`,
      },
    };
  }
  if (!supported.extensions.includes(extension)) {
    const known = MIME_BY_EXTENSION[extension];
    return {
      ok: false,
      issue: known
        ? {
            code: 'type-mismatch',
            message: `The file's contents (${mime}) do not match its .${extension} extension.`,
          }
        : {
            code: 'unsupported-extension',
            message: `.${extension} files are not supported. Supported: ${listExtensions(
              kinds,
            )}.`,
          },
    };
  }

  const size = candidate.size;
  if (size === null || size === undefined || Number.isNaN(size)) {
    return {
      ok: false,
      issue: {
        code: 'unknown-size',
        message: 'Could not read the file size. Try a different file.',
      },
    };
  }
  if (size <= 0) {
    return {
      ok: false,
      issue: { code: 'empty', message: 'The file is empty.' },
    };
  }
  const maxSize = options.maxSize ?? MAX_FILE_SIZE[supported.kind];
  if (size > maxSize) {
    return {
      ok: false,
      issue: {
        code: 'too-large',
        message: `The file is ${formatFileSize(
          size,
        )}; the limit is ${formatFileSize(maxSize)}.`,
      },
    };
  }

  const file: SelectedFile = {
    uri: candidate.uri,
    name: candidate.name?.trim() || `file.${extension}`,
    size,
    mimeType: mime,
    extension,
    kind: supported.kind,
    source: candidate.source,
    width: candidate.width,
    height: candidate.height,
  };
  return { ok: true, file };
}

function describeKinds(kinds: readonly FileKind[]): string {
  const labels = kinds.map(k =>
    k === 'pdf' ? 'PDF' : 'JPG, PNG, WEBP or HEIC image',
  );
  return labels.join(' or ');
}

function listExtensions(kinds: readonly FileKind[]): string {
  return extensionsFor(kinds)
    .map(e => `.${e}`)
    .join(', ');
}
