// src/constants/allowedMimes.ts — explicit allowlists; never accept arbitrary mime (blocks .svg/.html/.exe disguise)
export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;
export const ALLOWED_AUDIO_MIME = [
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/aac",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
] as const;
export const ALLOWED_VIDEO_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];
export type AllowedAudioMime = (typeof ALLOWED_AUDIO_MIME)[number];
