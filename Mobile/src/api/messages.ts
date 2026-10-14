// src/api/messages.ts
import { api } from "./client";

export interface ChatMessage {
  _id: string;
  conversationId: string;
  sender: {
    _id: string;
    name: string;
    photos?: Array<{ url: string; isPrimary?: boolean }>;
  };
  content: string;
  type?: "text" | "image" | "call" | "audio";
  mediaUrl?: string;
  createdAt: string;
  read?: boolean;
}

export interface ConversationSummary {
  _id: string;
  participants: Array<{
    _id: string;
    name: string;
    photos?: Array<{ url: string; isPrimary?: boolean }>;
    isOnline?: boolean;
    lastSeen?: string;
  }>;
  lastMessage?: ChatMessage;
  unreadCount?: number;
  updatedAt: string;
}

export async function fetchConversations(): Promise<{ conversations: ConversationSummary[] }> {
  const { data } = await api.get("/api/messages/conversations");
  return data;
}

export async function fetchMessages(
  conversationId: string,
  page = 1
): Promise<{ messages: ChatMessage[]; total: number }> {
  const { data } = await api.get(`/api/messages/${conversationId}`, {
    params: { page },
  });
  return data;
}

export async function sendChatMessage(
  conversationId: string,
  content: string,
  type = "text",
  mediaUrl?: string
) {
  const { data } = await api.post(`/api/messages/${conversationId}`, {
    content,
    type,
    mediaUrl,
  });
  return data;
}

export async function createConversation(recipientId: string) {
  const { data } = await api.post("/api/messages/start", { recipientId });
  return data;
}
