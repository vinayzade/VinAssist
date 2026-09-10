import { env } from '@/config';
import {
  API_URL,
  getApiErrorMessage,
  useGetHealthQuery,
} from '@/services/api';

export type BackendStatus = 'checking' | 'connected' | 'unavailable';

export interface BackendStatusState {
  status: BackendStatus;
  /** Full URL that was probed, for display. */
  url: string;
  /** Base URL from the build's environment file. */
  baseUrl: string;
  /** Round-trip time of the last successful probe, in ms. */
  latencyMs: number | null;
  /** User-facing reason when unavailable. */
  error: string | null;
  /** When the last probe finished. */
  checkedAt: Date | null;
  isChecking: boolean;
  refresh: () => void;
}

/**
 * Probes `GET /api/v1/health` and reduces the RTK Query state to the three
 * states the dev screen cares about. Re-probes on every mount (no cache)
 * and on `refresh()`.
 */
export function useBackendStatus(): BackendStatusState {
  const {
    data,
    error,
    isFetching,
    isSuccess,
    isError,
    refetch,
    startedTimeStamp,
    fulfilledTimeStamp,
  } = useGetHealthQuery(undefined, { refetchOnMountOrArgChange: true });

  const settled = !isFetching && (isSuccess || isError);
  const connected = settled && isSuccess && data?.status === 'healthy';

  let status: BackendStatus = 'checking';
  if (settled) {
    status = connected ? 'connected' : 'unavailable';
  }

  let reason: string | null = null;
  if (status === 'unavailable') {
    reason = isError
      ? getApiErrorMessage(error)
      : 'The backend answered, but not with a healthy status.';
  }

  const latencyMs =
    connected && startedTimeStamp !== undefined && fulfilledTimeStamp !== undefined
      ? Math.max(0, fulfilledTimeStamp - startedTimeStamp)
      : null;

  const checkedAtMs = fulfilledTimeStamp ?? (isError ? startedTimeStamp : undefined);

  return {
    status,
    url: `${API_URL}/health`,
    baseUrl: env.API_BASE_URL,
    latencyMs,
    error: reason,
    checkedAt: settled && checkedAtMs !== undefined ? new Date(checkedAtMs) : null,
    isChecking: !settled,
    refresh: refetch,
  };
}
