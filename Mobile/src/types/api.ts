// src/types/api.ts  — generic transport contracts (no runtime code)
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  [k: string]: unknown;
}
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
export interface ApiErrorResponse {
  success?: false;
  message?: string;
  error?: string;
  code?: string;
  blocked?: boolean;
}
