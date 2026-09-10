/**
 * Per-request options passed as `extraOptions` on an endpoint definition.
 * Read by `prepareHeaders`, the reauth wrapper, and the retry wrapper.
 */
export interface ApiExtraOptions {
  /** Do not attach the Bearer token (login, register, refresh, public data). */
  skipAuth?: boolean;
  /** Do not attempt a token refresh on 401 (used by the refresh call itself). */
  skipRefresh?: boolean;
  /** Override the default timeout for this endpoint, in ms. */
  timeout?: number;
  /** Override the retry budget for this endpoint (0 disables retries). */
  maxRetries?: number;
}

/** Standard paginated envelope returned by list endpoints. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface PageParams {
  page?: number;
  pageSize?: number;
}

/**
 * A file to upload from the device. Matches what React Native's `FormData`
 * expects for a file part.
 */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/** Base64-encoded image payload for AI endpoints. */
export interface ImageInput {
  base64: string;
  mimeType: 'image/jpeg' | 'image/png';
}
