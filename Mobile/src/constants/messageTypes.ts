// src/constants/messageTypes.ts — inbound socket/API `type` must be one of these before a renderer touches it
export const MESSAGE_TYPES = [
  "text",
  "image",
  "voice",
  "audio",
  "gif",
  "sticker",
  "heart",
  "call",
  "system",
  "post",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];
export const CALL_TYPES = ["audio", "video"] as const;
export type CallType = (typeof CALL_TYPES)[number];
export function isMessageType(v: unknown): v is MessageType {
  return (
    typeof v === "string" && (MESSAGE_TYPES as readonly string[]).includes(v)
  );
}
