import type { HistoryItem, HistoryKind } from '@/features/history/types';
import { baseApi } from './baseApi';
import type { PageParams, Paginated } from './types';

/* ---------------------------- Backend contract ---------------------------- */

export interface HistoryListParams extends PageParams {
  kind?: HistoryKind;
}

export interface CreateHistoryItemPayload {
  kind: HistoryKind;
  title: string;
  summary: string;
  /** Free-form result payload; shape depends on `kind`. */
  payload?: unknown;
}

export interface HistoryItemDetail extends HistoryItem {
  payload?: unknown;
}

/* ------------------------------- Endpoints ------------------------------- */

/**
 * `/api/v1/history/*`. Server-side activity log. The local `history` slice
 * remains the optimistic, offline-first view; this is the source of truth
 * once the user is signed in.
 */
export const historyApi = baseApi.injectEndpoints({
  endpoints: build => ({
    listHistory: build.query<Paginated<HistoryItem>, HistoryListParams | void>({
      query: params => ({ url: '/history', params: params ?? undefined }),
      providesTags: result =>
        result
          ? [
              ...result.items.map(h => ({
                type: 'History' as const,
                id: h.id,
              })),
              { type: 'History' as const, id: 'LIST' },
            ]
          : [{ type: 'History' as const, id: 'LIST' }],
    }),

    getHistoryItem: build.query<HistoryItemDetail, string>({
      query: id => `/history/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: 'History', id }],
    }),

    createHistoryItem: build.mutation<HistoryItem, CreateHistoryItemPayload>({
      query: body => ({ url: '/history', method: 'POST', body }),
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    deleteHistoryItem: build.mutation<void, string>({
      query: id => ({
        url: `/history/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'History', id },
        { type: 'History', id: 'LIST' },
      ],
    }),

    clearHistory: build.mutation<void, void>({
      query: () => ({ url: '/history', method: 'DELETE' }),
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),
  }),
});

export const {
  useListHistoryQuery,
  useGetHistoryItemQuery,
  useCreateHistoryItemMutation,
  useDeleteHistoryItemMutation,
  useClearHistoryMutation,
} = historyApi;
