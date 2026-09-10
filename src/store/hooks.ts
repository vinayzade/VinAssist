import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './index';

/** Typed `useDispatch`: knows about thunks and RTK Query actions. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();

/** Typed `useSelector`: `state` is inferred as `RootState`. */
export const useAppSelector = useSelector.withTypes<RootState>();

/** Typed `useStore`, for the rare case a component needs the store itself. */
export const useAppStore = useStore.withTypes<AppStore>();
