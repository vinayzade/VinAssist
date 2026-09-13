import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { authReducer } from '@/features/auth/store/authSlice';
import { settingsReducer } from '@/features/settings/store/settingsSlice';
import { baseApi } from '@/services/api/baseApi';
import { listenerMiddleware } from './listenerMiddleware';

/**
 * Client state lives in feature slices. Server state lives in the RTK Query
 * cache under `baseApi.reducerPath`; do not copy API responses into slices.
 */
export const rootReducer = combineReducers({
  auth: authReducer,
  settings: settingsReducer,
  [baseApi.reducerPath]: baseApi.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Builds a store instance. The app uses the singleton `store` below; tests
 * call `setupStore(preloadedState)` to get an isolated instance.
 */
export function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware()
        .prepend(listenerMiddleware.middleware)
        .concat(baseApi.middleware),
  });
}

export const store = setupStore();

// Enables refetchOnFocus / refetchOnReconnect for RTK Query hooks.
setupListeners(store.dispatch);

export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore['dispatch'];
