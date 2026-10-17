// src/components/chat/index.ts
export { default as MessageBubble } from "./MessageBubble";
export { default as VoiceBubble } from "./VoiceBubble";
export { default as MessageStatusTick } from "./MessageStatusTick";
export { default as CallRow } from "./CallRow";
export { default as DateSeparator } from "./DateSeparator";
export { default as PhotoLightbox } from "./PhotoLightbox";
// ChatInputBar implementation re-created at ./ChatInputBar (nested). The flat
// components/ChatInputBar.tsx no longer exists, so this MUST be "./", not "../".
export { default as ChatInputBar } from "./ChatInputBar";
export type { SendPayload } from "./ChatInputBar";
// Add TypingIndicator ONLY after its file is non-empty AND a screen imports it:
// export { default as TypingIndicator } from "./TypingIndicator";
