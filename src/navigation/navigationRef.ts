import {
  createNavigationContainerRef,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import type { RootStackParamList } from './navigationTypes';

/**
 * Typed reference to the root navigation container. Lets non-component code
 * (listeners, push-notification handlers, error boundaries) navigate without
 * prop drilling. Always guard with `navigationRef.isReady()`.
 */
export const navigationRef: NavigationContainerRefWithCurrent<RootStackParamList> =
  createNavigationContainerRef<RootStackParamList>();

/** Name of the currently focused route, or `undefined` before the container mounts. */
export function getCurrentRouteName(): string | undefined {
  return navigationRef.isReady()
    ? navigationRef.getCurrentRoute()?.name
    : undefined;
}
