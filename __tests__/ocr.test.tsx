import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import * as ImagePicker from 'react-native-image-picker';
import { sessionStarted } from '@/features/auth';
import { OcrResultScreen, OcrScreen, titleFor } from '@/features/ocr';
import {
  MLKitOCRService,
  OCRError,
  computeStats,
  countWords,
  getOCRService,
  setOCRService,
  type OCRResult,
  type OCRService,
} from '@/services/ocr';
import type { TextRecognitionModule } from '@/native';
import { setupStore } from '@/store';
import { ThemeProvider, lightTheme } from '@/theme';

/* ------------------------------- fixtures ------------------------------- */

const NATIVE_RESULT = {
  text: 'Hello world\nSecond line\n\nNew block',
  blocks: [
    {
      text: 'Hello world\nSecond line',
      frame: { x: 0, y: 0, width: 100, height: 40 },
      language: 'en',
      lines: [
        { text: ' Hello world ', frame: { x: 0, y: 0, width: 100, height: 20 }, confidence: 0.9 },
        { text: 'Second line', frame: { x: 0, y: 20, width: 100, height: 20 }, confidence: 0.7 },
        { text: '   ', frame: { x: 0, y: 40, width: 0, height: 0 }, confidence: 0.1 },
      ],
    },
    {
      text: 'New block',
      frame: { x: 0, y: 60, width: 100, height: 20 },
      lines: [{ text: 'New block', frame: { x: 0, y: 60, width: 100, height: 20 } }],
    },
  ],
  imageWidth: 640,
  imageHeight: 480,
  engine: 'mlkit-latin',
  durationMs: 123,
};

function fakeModule(
  overrides: Partial<TextRecognitionModule> = {},
): TextRecognitionModule {
  return {
    getSupportedScripts: jest.fn(() => ['latin', 'devanagari', 'klingon']),
    recognize: jest.fn(async () => NATIVE_RESULT),
    ...overrides,
  } as unknown as TextRecognitionModule;
}

function sampleResult(text = 'Invoice 2026\nTotal 10'): OCRResult {
  const blocks = [
    {
      text,
      frame: { x: 0, y: 0, width: 10, height: 10 },
      lines: text.split('\n').map(t => ({
        text: t,
        frame: { x: 0, y: 0, width: 10, height: 10 },
        confidence: 0.8,
      })),
    },
  ];
  return {
    text,
    blocks,
    imageWidth: 100,
    imageHeight: 100,
    engine: 'mlkit-latin',
    durationMs: 50,
    stats: computeStats(blocks, text),
  };
}

/* ---------------------------------- service ---------------------------------- */

describe('MLKitOCRService', () => {
  it('normalises native output: trims, drops empty lines, rebuilds text, adds stats', async () => {
    const service = new MLKitOCRService(fakeModule());

    const result = await service.recognize({ uri: 'file:///a.jpg' });

    expect(result.text).toBe('Hello world\nSecond line\n\nNew block');
    expect(result.blocks[0].lines).toHaveLength(2);
    expect(result.stats).toEqual({
      lineCount: 3,
      wordCount: 6,
      meanConfidence: 0.8,
      language: 'en',
    });
    expect(result.engine).toBe('mlkit-latin');
  });

  it('passes the requested script and defaults to latin', async () => {
    const module = fakeModule();
    const service = new MLKitOCRService(module);

    await service.recognize({ uri: 'file:///a.jpg' });
    await service.recognize({ uri: 'file:///a.jpg' }, { script: 'devanagari' });

    expect(module.recognize).toHaveBeenNthCalledWith(1, 'file:///a.jpg', { script: 'latin' });
    expect(module.recognize).toHaveBeenNthCalledWith(2, 'file:///a.jpg', {
      script: 'devanagari',
    });
  });

  it('only reports scripts the app knows about', () => {
    expect(new MLKitOCRService(fakeModule()).supportedScripts()).toEqual([
      'latin',
      'devanagari',
    ]);
  });

  it('maps native error codes to OCRError codes', async () => {
    const module = fakeModule({
      recognize: jest.fn(async () => {
        throw Object.assign(new Error('boom'), { code: 'E_UNREADABLE' });
      }),
    });
    const service = new MLKitOCRService(module);

    await expect(service.recognize({ uri: 'file:///bad.jpg' })).rejects.toMatchObject({
      name: 'OCRError',
      code: 'unreadable',
    });
  });

  it('reports unavailable when the native module is missing', async () => {
    const service = new MLKitOCRService(null);

    expect(service.isAvailable()).toBe(false);
    expect(service.supportedScripts()).toEqual([]);
    await expect(service.recognize({ uri: 'x' })).rejects.toBeInstanceOf(OCRError);
  });

  it('is swappable through the service locator', () => {
    const custom: OCRService = {
      engine: 'other',
      isAvailable: () => true,
      supportedScripts: () => ['latin'],
      recognize: async () => sampleResult(),
    };
    setOCRService(custom);
    expect(getOCRService()).toBe(custom);
    setOCRService(null);
    expect(getOCRService()).toBeInstanceOf(MLKitOCRService);
  });

  it('ignores undetermined language tags from the engine', () => {
    const blocks = [
      {
        text: 'x',
        frame: { x: 0, y: 0, width: 1, height: 1 },
        language: 'und-Latn',
        lines: [{ text: 'x', frame: { x: 0, y: 0, width: 1, height: 1 }, language: 'und' }],
      },
    ];
    expect(computeStats(blocks, 'x').language).toBeUndefined();
  });

  it('helpers: countWords and titleFor', () => {
    expect(countWords('one two-three  4\n\n--- !!')).toBe(3);
    expect(titleFor('\n\n  First line here \nsecond')).toBe('First line here');
    expect(titleFor('')).toBe('Scanned text');
    expect(titleFor('x'.repeat(60))).toHaveLength(48);
  });
});

/* ---------------------------------- screens ---------------------------------- */

const picker = (ImagePicker as unknown as { __mock: { next: unknown } }).__mock;

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  // Unmount so RTK Query subscriptions and feedback timers are torn down
  // with the test instead of firing after Jest has shut the environment.
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(ui: React.ReactElement, store = setupStore()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
const flush = () => act(() => new Promise<void>(r => setTimeout(r, 0)));

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: jest.fn(),
} as never;

describe('OcrScreen', () => {
  let recognize: jest.Mock;

  beforeEach(() => {
    recognize = jest.fn(async () => sampleResult());
    setOCRService({
      engine: 'fake',
      isAvailable: () => true,
      supportedScripts: () => ['latin'],
      recognize,
    });
    (navigation as { navigate: jest.Mock }).navigate.mockClear();
  });
  afterEach(() => setOCRService(null));

  it('offers camera and gallery when no image is selected', () => {
    const tree = render(<OcrScreen navigation={navigation} route={{ key: 'k', name: 'OCR', params: undefined }} />);

    expect(has(tree, 'ocr-capture')).toBe(true);
    expect(has(tree, 'ocr-choose')).toBe(true);
    act(() => host(tree, 'ocr-capture').props.onClick());
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('Scanner', {
      target: 'OCR',
    });
  });

  it('recognises a scanned image automatically and opens the result', async () => {
    const tree = render(
      <OcrScreen
        navigation={navigation}
        route={{ key: 'k', name: 'OCR', params: { imageUri: 'file:///scan.jpg' } }}
      />,
    );
    await flush();

    expect(recognize).toHaveBeenCalledWith({ uri: 'file:///scan.jpg' }, undefined);
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'OCRResult',
      expect.objectContaining({ imageUri: 'file:///scan.jpg' }),
    );
    expect(has(tree, 'ocr-preview')).toBe(true);
  });

  it('lets the user pick from the gallery, then extract', async () => {
    picker.next = {
      assets: [{ uri: 'file:///pick.jpg', fileName: 'pick.jpg', fileSize: 1000, type: 'image/jpeg', width: 10, height: 10 }],
    };
    const tree = render(<OcrScreen navigation={navigation} route={{ key: 'k', name: 'OCR', params: undefined }} />);

    await act(async () => host(tree, 'ocr-choose').props.onClick());
    expect(has(tree, 'ocr-preview')).toBe(true);
    expect(recognize).not.toHaveBeenCalled();

    await act(async () => host(tree, 'ocr-extract').props.onClick());
    expect(recognize).toHaveBeenCalledWith({ uri: 'file:///pick.jpg' }, undefined);
  });

  it('shows the error and a retry when recognition fails', async () => {
    recognize.mockRejectedValueOnce(new OCRError('Could not read that image.', 'unreadable'));
    const tree = render(
      <OcrScreen
        navigation={navigation}
        route={{ key: 'k', name: 'OCR', params: { imageUri: 'file:///bad.jpg' } }}
      />,
    );
    await flush();

    expect(textOf(tree, 'ocr-error')).toBe('Could not read that image.');
    expect(host(tree, 'ocr-extract').props.accessibilityState?.disabled).toBeFalsy();
    expect((navigation as { navigate: jest.Mock }).navigate).not.toHaveBeenCalled();
  });

  it('explains when no engine is available', () => {
    setOCRService({
      engine: 'none',
      isAvailable: () => false,
      supportedScripts: () => [],
      recognize: async () => {
        throw new OCRError('n/a', 'unavailable');
      },
    });
    const tree = render(<OcrScreen navigation={navigation} route={{ key: 'k', name: 'OCR', params: undefined }} />);
    expect(has(tree, 'ocr-unavailable')).toBe(true);
    expect(has(tree, 'ocr-capture')).toBe(false);
  });
});

describe('OcrResultScreen', () => {
  const calls: Request[] = [];
  let responder: (req: Request) => Response = () => new Response('Not Found', { status: 404 });

  beforeAll(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      calls.push(req);
      return responder(req);
    }) as typeof fetch;
  });
  beforeEach(() => {
    calls.length = 0;
    responder = () => new Response('Not Found', { status: 404 });
    (navigation as { navigate: jest.Mock }).navigate.mockClear();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });

  const route = (result = sampleResult()) =>
    ({ key: 'k', name: 'OCRResult', params: { imageUri: 'file:///a.jpg', result } }) as never;

  it('renders the text and stats', () => {
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />);

    expect(textOf(tree, 'ocr-result-text')).toBe('Invoice 2026\nTotal 10');
    expect(textOf(tree, 'ocr-result-meta')).toContain('4 words');
    expect(textOf(tree, 'ocr-result-meta')).toContain('80% confidence');
  });

  it('copies and shares the text', async () => {
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />);

    act(() => host(tree, 'ocr-copy').props.onClick());
    expect(Clipboard.setString).toHaveBeenCalledWith('Invoice 2026\nTotal 10');

    await act(async () => host(tree, 'ocr-share').props.onClick());
    expect(Share.share).toHaveBeenCalledWith({ message: 'Invoice 2026\nTotal 10' });
  });

  it('hands the text to the assistant', () => {
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />);

    act(() => host(tree, 'ocr-ask-ai').props.onClick());

    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'AIAssistant',
      params: { attach: { type: 'ocr', text: 'Invoice 2026\nTotal 10', title: 'Recognised text' } },
    });
  });

  it('saves the result to the backend', async () => {
    responder = () =>
      new Response(
        JSON.stringify({ id: 'r1', preview: 'Invoice 2026', wordCount: 4, confidence: 0.8, language: null, engine: 'mlkit-latin', createdAt: 'now', text: 'x' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    const store = setupStore();
    store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />, store);

    await act(async () => host(tree, 'ocr-save').props.onClick());
    await flush();

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/ocr/results');
    expect(await calls[0].json()).toMatchObject({ text: 'Invoice 2026\nTotal 10', engine: 'mlkit-latin' });
    expect(has(tree, 'ocr-save-error')).toBe(false);
  });

  it('explains when the backend save fails', async () => {
    const store = setupStore();
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />, store);

    await act(async () => host(tree, 'ocr-save').props.onClick());
    await flush();

    expect(textOf(tree, 'ocr-save-error')).toMatch(/Could not save to your history/);
  });

  it('shows a clear message when summarisation is not available yet', async () => {
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />);

    await act(async () => host(tree, 'ocr-summarize').props.onClick());
    await flush();

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/ai/summarize');
    expect(await calls[0].json()).toEqual({ text: 'Invoice 2026\nTotal 10', mode: 'quick', source: 'ocr' });
    expect(textOf(tree, 'ocr-summary-error')).toMatch(/not available on the backend yet/);
  });

  const summaryResponse = (body: Record<string, unknown>) =>
    new Response(
      JSON.stringify({
        summary: 'An invoice.',
        items: [],
        mode: 'quick',
        documentType: 'invoice',
        processingMs: 812,
        modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        provider: 'huggingface',
        createdAt: '2026-09-11T00:00:00Z',
        ...body,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  it('renders a prose summary with model and timing', async () => {
    responder = () => summaryResponse({});
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />);

    await act(async () => host(tree, 'ocr-summarize').props.onClick());
    await flush();

    expect(has(tree, 'ocr-summary')).toBe(true);
    expect(textOf(tree, 'ocr-summary-title')).toBe('Quick summary');
    expect(textOf(tree, 'ocr-summary-text')).toBe('An invoice.');
    expect(textOf(tree, 'ocr-summary-meta')).toContain('812 ms');
  });

  it('sends the chosen mode and renders list modes as items', async () => {
    responder = () =>
      summaryResponse({ summary: '2 action items.', mode: 'action_items', items: ['Pay by Friday', 'Call billing'] });
    const tree = render(<OcrResultScreen navigation={navigation} route={route()} />);

    await act(async () => host(tree, 'ocr-summary-mode-action_items').props.onClick());
    await flush();

    expect((await calls[0].json()).mode).toBe('action_items');
    expect(textOf(tree, 'ocr-summary-title')).toBe('Action items');
    expect(has(tree, 'ocr-summary-text')).toBe(false);
    const texts = tree.root.findAllByType('Text' as never).map(n => String(n.props.children));
    expect(texts).toEqual(expect.arrayContaining(['Pay by Friday', 'Call billing']));

    act(() => host(tree, 'ocr-summary-copy').props.onClick());
    expect(Clipboard.setString).toHaveBeenLastCalledWith('• Pay by Friday\n• Call billing');
  });

  it('shows an empty state when nothing was recognised', () => {
    const tree = render(<OcrResultScreen navigation={navigation} route={route(sampleResult(''))} />);
    expect(has(tree, 'ocr-result-empty')).toBe(true);
    expect(has(tree, 'ocr-copy')).toBe(false);
  });
});
