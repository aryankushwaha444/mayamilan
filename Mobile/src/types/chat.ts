// src/types/chat.ts — ChatMessage/ConversationSummary canonical in api/messages; re-export to avoid identity drift
export type { ChatMessage, ConversationSummary } from "../api/messages";
export interface MessageGroup {
  date: string;
  messages: import("../api/messages").ChatMessage[];
}
export interface TypingState {
  conversationId: string;
  userId: string;
  name?: string;
}
