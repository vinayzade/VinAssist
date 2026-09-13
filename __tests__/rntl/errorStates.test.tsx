/**
 * Error states the user can hit, and what the screens show for each: the
 * shared error view, list failures with retry, chat failures that keep the
 * user's input, indexing failures, and a session that expires mid-use.
 */

import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ErrorView } from '@/components';
import { AIAssistantScreen } from '@/features/aiAssistant';
import { DocumentChatScreen } from '@/features/documentAnalysis';
import { HistoryScreen } from '@/features/history';
import { getApiErrorMessage, toApiError, type ApiError } from '@/services/api';
import { setSpeechService } from '@/services/speech';
import { setVoiceService } from '@/services/voice';
import { fixtures, installFetchMock, type FetchMock } from '../../test-utils/fetchMock';
import { fakeNavigation, fakeRoute, renderWithProviders } from '../../test-utils/render';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = require('react');
  return { ...actual, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

let api: FetchMock;
beforeEach(() => {
  api = installFetchMock();
});
beforeAll(() => {
  setSpeechService({ engine: 'none', isAvailable: () => false, start: jest.fn(), stop: jest.fn(), cancel: jest.fn() });
  setVoiceService({
    canListen: () => false, canSpeak: () => false, listen: jest.fn(), stopListening: jest.fn(),
    cancelListening: jest.fn(), speak: jest.fn(), stopSpeaking: jest.fn(), isSpeaking: () => false, stopAll: jest.fn(),
  });
});

describe('error normalisation', () => {
  it.each<[unknown, string | number, string]>([
    [{ status: 'FETCH_ERROR', error: 'TypeError: Network request failed' }, 'NETWORK', 'Network error. Check your connection and try again.'],
    [{ status: 'TIMEOUT_ERROR', error: 'timeout' }, 'TIMEOUT', 'The request timed out. Please try again.'],
    [{ status: 503, data: { detail: 'The AI service is temporarily unavailable.', code: 'AI_UNAVAILABLE' } }, 503, 'The AI service is temporarily unavailable.'],
    [{ status: 500, data: 'Internal Server Error' }, 500, expect.any(String)],
  ])('maps %o', (raw, status, message) => {
    const mapped = toApiError(raw as never);
    expect(mapped.status).toBe(status);
    expect(mapped.message).toEqual(message);
    expect(getApiErrorMessage(mapped)).toEqual(message);
  });

  it('keeps the backend error code for callers that branch on it', () => {
    const mapped: ApiError = toApiError({ status: 422, data: { detail: 'No text', code: 'DOCUMENT_NOT_INDEXABLE' } } as never);
    expect(mapped.code).toBe('DOCUMENT_NOT_INDEXABLE');
  });
});

describe('ErrorView', () => {
  it('shows a friendly message for an API error and offers a retry', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(
      <ErrorView error={{ status: 'NETWORK', message: 'Network error. Check your connection and try again.' }} onRetry={onRetry} />,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Network error. Check your connection and try again.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('prefers an explicit message and hides the retry when none is given', async () => {
    await renderWithProviders(<ErrorView message="Nothing to see here." error={{ status: 500, message: 'x' }} />);
    expect(screen.getByText('Nothing to see here.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });
});

describe('History: server failure', () => {
  it('shows the error view with retry, then the list once the server recovers', async () => {
    let healthy = false;
    api.on('GET', '/api/v1/history', () =>
      healthy ? api.json(fixtures.page([{ id: 'h1', kind: 'ocr', title: 'Receipt', preview: '', favourite: false, refId: null, lastActivityAt: 'x', createdAt: 'x' }])) : api.networkError(),
    );
    await renderWithProviders(<HistoryScreen navigation={fakeNavigation() as never} route={fakeRoute('History')} />);

    expect(await screen.findByTestId('history-error')).toBeTruthy();
    expect(screen.getByText(/Network error/)).toBeTruthy();

    healthy = true;
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByTestId('history-item-h1')).toBeTruthy();
    expect(screen.queryByTestId('history-error')).toBeNull();
  });

  it('a failed favourite toggle leaves the item unchanged and does not crash', async () => {
    api.on('GET', '/api/v1/history', () =>
      api.json(fixtures.page([{ id: 'h1', kind: 'ocr', title: 'Receipt', preview: '', favourite: false, refId: null, lastActivityAt: 'x', createdAt: 'x' }])),
    );
    api.on('PATCH', '/api/v1/history/h1', () => api.json(fixtures.error('Nope', 'SERVER'), 500));
    await renderWithProviders(<HistoryScreen navigation={fakeNavigation() as never} route={fakeRoute('History')} />);
    const star = await screen.findByTestId('history-star-h1');
    await fireEvent.press(star);
    await waitFor(() => expect(api.calls('PATCH')).toHaveLength(1));
    expect(screen.getByTestId('history-star-h1').props.accessibilityState.selected).toBe(false);
  });
});

describe('Assistant: a failed turn', () => {
  it('shows the failure as a message and keeps the attachment for a retry', async () => {
    let attempts = 0;
    api.on('POST', '/api/v1/ai/chat', () => {
      attempts += 1;
      return attempts === 1
        ? api.json(fixtures.error('The AI service took too long to respond.', 'AI_TIMEOUT'), 504)
        : api.json({
            conversationId: 'c1', messageId: 'm', answer: 'The total is 1,250.00.', sources: [], grounded: true, scope: 'material',
            suggestions: [], context: [{ type: 'ocr', title: 'Recognised text' }], modelName: 'llama', provider: 'hf',
            retrievalMs: 1, generationMs: 2, processingMs: 3, createdAt: 'x',
          });
    });
    await renderWithProviders(
      <AIAssistantScreen
        navigation={fakeNavigation() as never}
        route={fakeRoute('AIAssistant', { attach: { type: 'ocr', text: 'Total due: 1,250.00', title: 'Recognised text' } })}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('assistant-input'), 'What is the total?');
    await fireEvent.press(screen.getByTestId('assistant-send'));

    expect(await screen.findByText('The AI service took too long to respond.')).toBeTruthy();
    // The OCR chip is back in the composer so the user can simply send again.
    expect(screen.getByTestId('assistant-pending')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('assistant-input'), 'What is the total?');
    await fireEvent.press(screen.getByTestId('assistant-send'));
    expect(await screen.findByText('The total is 1,250.00.')).toBeTruthy();
    expect(attempts).toBe(2);
  });
});

describe('Document chat: document cannot be indexed', () => {
  it('explains the problem, disables asking, and recovers on retry', async () => {
    let indexable = false;
    api.on('POST', '/api/v1/documents/d1/index', () =>
      indexable
        ? api.json({ documentId: 'd1', chunkCount: 3, characters: 900, embeddingModel: 'm', processingMs: 5 })
        : api.json(fixtures.error('This document has no text to index.', 'DOCUMENT_NOT_INDEXABLE'), 422),
    );
    await renderWithProviders(
      <DocumentChatScreen
        navigation={fakeNavigation() as never}
        route={fakeRoute('DocumentChat', { documentId: 'd1', name: 'scan.pdf', kind: 'pdf' })}
      />,
    );
    expect(await screen.findByTestId('document-chat-index-error')).toHaveTextContent(/no readable text/);
    expect(screen.getByTestId('document-chat-send').props.accessibilityState.disabled).toBe(true);

    indexable = true;
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByTestId('document-chat-index-info')).toHaveTextContent(/3 passages/);
  });
});

describe('Session expiry during use', () => {
  it('a 401 whose refresh is rejected signs the user out and clears the API cache', async () => {
    api.on('GET', '/api/v1/history', () => api.json(fixtures.error('Token expired', 'TOKEN_EXPIRED'), 401));
    api.on('POST', '/api/v1/auth/refresh', () => api.json(fixtures.error('Refresh token revoked', 'TOKEN_REVOKED'), 401));
    const { store } = await renderWithProviders(
      <HistoryScreen navigation={fakeNavigation() as never} route={fakeRoute('History')} />,
    );
    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false));
    expect(store.getState().auth.signOutReason).toBe('expired');
    await act(async () => undefined);
    expect(api.calls('POST', '/api/v1/auth/refresh')).toHaveLength(1);
  });
});
