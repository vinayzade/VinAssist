import { createListenerMiddleware, addListener } from '@reduxjs/toolkit';
import type { AppDispatch, RootState } from './index';

/**
 * Listener middleware for side effects that react to actions (persistence,
 * analytics, logging). This is the sanctioned replacement for sagas.
 */
export const listenerMiddleware = createListenerMiddleware();

export const startAppListening = listenerMiddleware.startListening.withTypes<
  RootState,
  AppDispatch
>();

export const addAppListener = addListener.withTypes<RootState, AppDispatch>();
