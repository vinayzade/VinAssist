export type Nullable<T> = T | null;

export type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  status: number;
  message: string;
}
