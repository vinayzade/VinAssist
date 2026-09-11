import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import Clipboard from '@react-native-clipboard/clipboard';
import { OcrResultScreen, fieldsToText, formatValue } from '@/features/ocr';
import type { ExtractDocumentResult } from '@/services/api';
import { computeStats, type OCRResult } from '@/services/ocr';
import { setupStore } from '@/store';
import { ThemeProvider, lightTheme } from '@/theme';

const CARD_TEXT = 'Vinay Zade\nSenior Software Engineer\nAcme Technologies Pvt Ltd\nvinay@acme.com\n+91 98765 43210';

const CARD_RESULT: ExtractDocumentResult = {
  documentType: 'BUSINESS_CARD',
  confidence: 0.94,
  data: {
    name: 'Vinay Zade',
    company: 'Acme Technologies Pvt Ltd',
    designation: 'Senior Software Engineer',
    email: 'vinay@acme.com',
    phone: '+919876543210',
    website: null,
    address: null,
  },
  warnings: [],
  completeness: 0.71,
  processingMs: 1450,
  modelName: 'meta-llama/Llama-3.1-8B-Instruct',
  provider: 'huggingface',
  createdAt: '2026-09-11T00:00:00Z',
};

const calls: Request[] = [];
let responder: () => Response = () =>
  new Response(JSON.stringify(CARD_RESULT), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

beforeAll(() => {
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    return responder();
  }) as typeof fetch;
});
beforeEach(() => {
  calls.length = 0;
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function ocrResult(text: string): OCRResult {
  const blocks = [
    {
      text,
      frame: { x: 0, y: 0, width: 10, height: 10 },
      lines: text.split('\n').map(t => ({ text: t, frame: { x: 0, y: 0, width: 10, height: 10 } })),
    },
  ];
  return { text, blocks, imageWidth: 100, imageHeight: 100, engine: 'mlkit-latin', durationMs: 50, stats: computeStats(blocks, text) };
}

function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={setupStore()}>
        <ThemeProvider theme={lightTheme}>
          <OcrResultScreen
            navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
            route={{ key: 'k', name: 'OCRResult', params: { imageUri: 'file:///c.jpg', result: ocrResult(CARD_TEXT) } } as never}
          />
        </ThemeProvider>
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

describe('formatters', () => {
  it('formats leaves, lists and objects for display', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(1250)).toBe('1250');
    expect(formatValue(5.5)).toBe('5.50');
    expect(formatValue(['a', 'b'])).toBe('a, b');
    expect(formatValue({ company: 'Acme', title: 'Eng', start: null })).toBe('Company: Acme · Title: Eng');
  });

  it('renders copyable plain text with only populated fields', () => {
    const text = fieldsToText(CARD_RESULT);
    expect(text.split('\n')[0]).toBe('Business card');
    expect(text).toContain('Email: vinay@acme.com');
    expect(text).not.toContain('Website');
  });
});

describe('OcrResultScreen extraction', () => {
  it('posts the OCR text to /ai/extract and renders typed fields', async () => {
    const tree = render();

    await act(async () => host(tree, 'ocr-extract').props.onClick());
    await flush();

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/ai/extract');
    expect(await calls[0].json()).toEqual({ text: CARD_TEXT });
    expect(textOf(tree, 'ocr-extraction-type')).toBe('Business card · 94%');
    expect(has(tree, 'ocr-extraction-field-email')).toBe(true);
    expect(has(tree, 'ocr-extraction-field-website')).toBe(false); // null fields hidden
    expect(textOf(tree, 'ocr-extraction-meta')).toContain('1450 ms');

    act(() => host(tree, 'ocr-extraction-copy').props.onClick());
    expect(Clipboard.setString).toHaveBeenLastCalledWith(fieldsToText(CARD_RESULT));
  });

  it('shows validator warnings and the empty state', async () => {
    responder = () =>
      new Response(
        JSON.stringify({
          ...CARD_RESULT,
          data: { name: null, company: null, designation: null, email: null, phone: null, website: null, address: null },
          warnings: ["Dropped 'email': not found in the document text."],
          completeness: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const tree = render();

    await act(async () => host(tree, 'ocr-extract').props.onClick());
    await flush();

    expect(has(tree, 'ocr-extraction-empty')).toBe(true);
    expect(has(tree, 'ocr-extraction-warning')).toBe(true);
  });

  it('surfaces backend errors inline', async () => {
    responder = () =>
      new Response(JSON.stringify({ detail: 'The AI service took too long to respond.', code: 'AI_TIMEOUT' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      });
    const tree = render();

    await act(async () => host(tree, 'ocr-extract').props.onClick());
    await flush();

    expect(textOf(tree, 'ocr-extract-error')).toMatch(/too long/);
    expect(has(tree, 'ocr-extraction')).toBe(false);
  });
});
