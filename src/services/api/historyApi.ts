import { baseApi } from './baseApi';
import type { Paginated } from './types';

/* ---------------------------- Backend contract ---------------------------- */

/** Mirrors `ActivityKind` on the backend (`app/models/activity.py`). */
export type ActivityKind =
  | 'ocr'
  | 'document_analysis'
  | 'image_analysis'
  | 'image_quality'
  | 'sentiment'
  | 'conversation';

export const ACTIVITY_KINDS: ActivityKind[] = [
  'ocr',
  'document_analysis',
  'image_analysis',
  'image_quality',
  'sentiment',
  'conversation',
];

/** One row of `GET /history`. */
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  preview: string;
  favourite: boolean;
  /** Id of the detailed result (conversation, OCR result, ...), when any. */
  refId?: string | null;
  lastActivityAt: string;
  createdAt: string;
}

export interface ActivityDetail extends ActivityItem {
  /** Result snapshot; shape depends on `kind`. */
  payload?: Record<string, unknown> | null;
}

export interface HistoryFilter {
  /** Restrict to these kinds; empty means all. */
  kinds?: ActivityKind[];
  /** Only favourites. */
  favourite?: boolean;
  /** Matches title and preview, case-insensitive. */
  q?: string;
  pageSize?: number;
}

export interface UpdateActivityPayload {
  id: string;
  title?: string;
  favourite?: boolean;
}

export const HISTORY_PAGE_SIZE = 20;

/* ------------------------------- Endpoints ------------------------------- */

/**
 * `/api/v1/history`. The server is the source of truth for AI activity;
 * the list is paged and only the pages the user has scrolled to are held
 * in the cache. Mutations invalidate the list so every loaded page is
 * refreshed together.
 */
export const historyApi = baseApi.injectEndpoints({
  endpoints: build => ({
    listHistory: build.infiniteQuery<Paginated<ActivityItem>, HistoryFilter, number>({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: lastPage => (lastPage.hasMore ? lastPage.page + 1 : undefined),
      },
      query: ({ queryArg, pageParam }) => ({
        url: '/history',
        params: {
          page: pageParam,
          pageSize: queryArg.pageSize ?? HISTORY_PAGE_SIZE,
          kind: queryArg.kinds && queryArg.kinds.length > 0 ? queryArg.kinds : undefined,
          favourite: queryArg.favourite ? true : undefined,
          q: queryArg.q?.trim() || undefined,
        },
      }),
      providesTags: result =>
        result
          ? [
              ...result.pages.flatMap(page =>
                page.items.map(item => ({ type: 'History' as const, id: item.id })),
              ),
              { type: 'History' as const, id: 'LIST' },
            ]
          : [{ type: 'History' as const, id: 'LIST' }],
    }),

    getHistoryItem: build.query<ActivityDetail, string>({
      query: id => `/history/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: 'History', id }],
    }),

    updateHistoryItem: build.mutation<ActivityItem, UpdateActivityPayload>({
      query: ({ id, ...body }) => ({
        url: `/history/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'History', id },
        { type: 'History', id: 'LIST' },
      ],
    }),

    deleteHistoryItem: build.mutation<void, string>({
      query: id => ({ url: `/history/${encodeURIComponent(id)}`, method: 'DELETE' }),
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
  useListHistoryInfiniteQuery,
  useGetHistoryItemQuery,
  useUpdateHistoryItemMutation,
  useDeleteHistoryItemMutation,
  useClearHistoryMutation,
} = historyApi;
