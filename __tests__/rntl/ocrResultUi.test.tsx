/**
 * OCR result screen with React Native Testing Library: what the user sees
 * after on-device recognition, and each action that follows from it.
 */

import React from 'react';
import { Share } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import * as ClipboardModule from '@react-native-clipboard/clipboard';
import { OcrResultScreen } from '@/features/ocr';
import { computeStats, type OCRResult } from '@/services/ocr';
import { fixtures, installFetchMock, type FetchMock } from '../../test-utils/fetchMock';
import { fakeNavigation, fakeRoute, renderWithProviders } from '../../test-utils/render';

const clipboard = ClipboardModule as unknown as { __mock: { value: string } };
const setString = Clipboard.setString as jest.Mock;

function ocrResult(text = 'INVOICE 2026-001\nBill to: Vinay Zade\nTotal due: 1,250.00'): OCRResult {
  const blocks = [
    {
      text,
      frame: { x: 0, y: 0, width: 10, height: 10 },
      lines: text.split('\n').map(t => ({ text: t, frame: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.92 })),
      language: 'en',
    },
  ];
  return { text, blocks, imageWidth: 1200, imageHeight: 1600, engine: 'mlkit-latin', durationMs: 84, stats: computeStats(blocks, text) };
}

let api: FetchMock;
beforeEach(() => {
  api = installFetchMock();
  clipboard.__mock.value = '';
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
});

async function renderResult(result = ocrResult()) {
  const navigation = fakeNavigation();
  const view = await renderWithProviders(
    <OcrResultScreen navigation={navigation as never} route={fakeRoute('OCRResult', { imageUri: 'file:///scan.jpg', result })} />,
  );
  return { navigation, ...view };
}

describe('OCR result UI', () => {
  it('shows the recognised text with its statistics', async () => {
    await renderResult();
    expect(screen.getByTestId('ocr-result-text')).toHaveTextContent(/Total due: 1,250\.00/);
    expect(screen.getByTestId('ocr-result-meta')).toHaveTextContent(/9 words · 3 lines · 92% confidence · EN · 84 ms on device/);
    expect(screen.queryByTestId('ocr-result-empty')).toBeNull();
  });

  it('explains when nothing was recognised and hides the text actions', async () => {
    await renderResult(ocrResult('   '));
    expect(screen.getByTestId('ocr-result-empty')).toBeTruthy();
    expect(screen.queryByTestId('ocr-copy')).toBeNull();
    expect(screen.queryByTestId('ocr-summarize')).toBeNull();
  });

  it('copies and shares the text', async () => {
    await renderResult();
    await fireEvent.press(screen.getByTestId('ocr-copy'));
    expect(setString).toHaveBeenCalledWith('INVOICE 2026-001\nBill to: Vinay Zade\nTotal due: 1,250.00');
    await fireEvent.press(screen.getByTestId('ocr-share'));
    expect(Share.share).toHaveBeenCalledWith({ message: expect.stringContaining('INVOICE 2026-001') });
  });

  it('summarises in the chosen mode and renders bullet items', async () => {
    api.on('POST', '/api/v1/ai/summarize', async req => {
      const body = (await req.json()) as { mode: string; source: string };
      return api.json({
        summary: body.mode === 'bullet_points' ? '2 key points.' : 'An invoice for 1,250.00 billed to Vinay Zade.',
        items: body.mode === 'bullet_points' ? ['Invoice 2026-001', 'Total due 1,250.00'] : [],
        mode: body.mode, documentType: 'invoice', processingMs: 320, modelName: 'llama', provider: 'hf', createdAt: 'x',
      });
    });
    await renderResult();

    await fireEvent.press(screen.getByTestId('ocr-summarize'));
    expect(await screen.findByTestId('ocr-summary')).toBeTruthy();
    expect(screen.getByTestId('ocr-summary-text')).toHaveTextContent(/An invoice for 1,250\.00 billed to Vinay Zade\./);
    expect(api.calls('POST', '/api/v1/ai/summarize')[0].body).toMatchObject({ mode: 'quick', source: 'ocr' });

    await fireEvent.press(screen.getByTestId('ocr-summary-mode-bullet_points'));
    await waitFor(() => expect(screen.getByText('Invoice 2026-001')).toBeTruthy());
    expect(screen.getByText('Total due 1,250.00')).toBeTruthy();
    expect(api.calls('POST', '/api/v1/ai/summarize')[1].body).toMatchObject({ mode: 'bullet_points' });
  });

  it('shows the service error when summarisation is unavailable', async () => {
    api.on('POST', '/api/v1/ai/summarize', () =>
      api.json(fixtures.error('The AI service is temporarily unavailable.', 'AI_UNAVAILABLE'), 503),
    );
    await renderResult();
    await fireEvent.press(screen.getByTestId('ocr-summarize'));
    expect(await screen.findByTestId('ocr-summary-error')).toHaveTextContent(/The AI service is temporarily unavailable\./);
    expect(screen.queryByTestId('ocr-summary')).toBeNull();
  });

  it('extracts structured fields and lists validator warnings', async () => {
    api.on('POST', '/api/v1/ai/extract', () =>
      api.json({
        documentType: 'INVOICE', confidence: 0.95,
        data: { invoiceNumber: '2026-001', total: 1250, currency: null, vendor: null },
        scores: {}, warnings: ['Dropped due_date: not found in the text.'], completeness: 0.5,
        processingMs: 900, modelName: 'llama', provider: 'hf', createdAt: 'x',
      }),
    );
    await renderResult();
    await fireEvent.press(screen.getByTestId('ocr-extract'));
    expect(await screen.findByTestId('ocr-extraction')).toBeTruthy();
    expect(screen.getByTestId('ocr-extraction-type')).toHaveTextContent(/invoice/i);
    expect(screen.getByTestId('ocr-extraction-field-invoiceNumber')).toHaveTextContent(/2026-001/);
    expect(screen.getByTestId('ocr-extraction-warning')).toHaveTextContent(/due_date/);
  });

  it('saves to the account and reports a failed save without losing the text', async () => {
    api.on('POST', '/api/v1/ocr/results', () =>
      api.json({ id: 'r1', preview: 'INVOICE', wordCount: 8, confidence: 0.92, language: 'en', engine: 'mlkit-latin', createdAt: 'x', text: 'x' }, 201),
    );
    await renderResult();
    await fireEvent.press(screen.getByTestId('ocr-save'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(api.calls('POST', '/api/v1/ocr/results')[0].body).toMatchObject({ engine: 'mlkit-latin', language: 'en' });

    api.on('POST', '/api/v1/ocr/results', () => api.networkError());
    const second = await renderResult();
    await fireEvent.press(second.getByTestId('ocr-save'));
    expect(await second.findByTestId('ocr-save-error')).toHaveTextContent(/Could not save to your history/);
    expect(second.getByTestId('ocr-result-text')).toHaveTextContent(/Total due: 1,250\.00/);
  });

  it('hands the text to the assistant as an attachment', async () => {
    const { navigation } = await renderResult();
    await fireEvent.press(screen.getByTestId('ocr-ask-ai'));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'AIAssistant',
      params: { attach: { type: 'ocr', title: 'Recognised text', text: expect.stringContaining('INVOICE 2026-001') } },
    });
  });
});

afterEach(() => {
  (Share.share as jest.Mock).mockRestore?.();
});
