// src/constants/limits.ts — mirror the backend so oversized/DoS payloads fail fast client-side
export const MAX_TEXT_LENGTH = 2000;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_RECORDING_SECONDS = 180; // 3 min voice cap
export const PAGE_SIZE = 50;
export const DELETE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 h "delete for everyone"
export const BIO_MAX = 500;
export const NAME_MAX = 60;
export const INTERESTS_MAX = 20;
export const REPORT_MIN = 10;
export const REPORT_MAX = 1000;
export const URL_MAX = 2048;
