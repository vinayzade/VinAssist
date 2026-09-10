import {
  createSelector,
  createSlice,
  nanoid,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { HistoryItem, HistoryState } from '../types';

const initialState: HistoryState = {
  items: [],
};

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    addHistoryItem: {
      reducer(state, { payload }: PayloadAction<HistoryItem>) {
        state.items.unshift(payload);
      },
      prepare(item: Omit<HistoryItem, 'id' | 'createdAt'>) {
        return {
          payload: {
            ...item,
            id: nanoid(),
            createdAt: new Date().toISOString(),
          },
        };
      },
    },
    removeHistoryItem(state, { payload }: PayloadAction<string>) {
      state.items = state.items.filter(item => item.id !== payload);
    },
    clearHistory(state) {
      state.items = [];
    },
  },
});

export const { addHistoryItem, removeHistoryItem, clearHistory } =
  historySlice.actions;
export const historyReducer = historySlice.reducer;

const selectHistoryItems = (state: { history: HistoryState }) =>
  state.history.items;

/** Newest-first slice of the local history, memoised per limit. */
export const selectRecentHistory = createSelector(
  [
    selectHistoryItems,
    (_state: { history: HistoryState }, limit: number) => limit,
  ],
  (items, limit) => items.slice(0, limit),
);
