// src/api/messages.ts
import { api } from "./client";
import { Platform } from "react-native";

export interface MessageUser {
  _id: string;
  name: string;
  photos?: Array<{ url: string; isPrimary?: boolean }>;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface ChatMessage {
  _id: string;
  conversationId: string;
  sender: {
    _id: string;
    name: string;
    photos?: Array<{ url: string; isPrimary?: boolean }>;
  };
  receiver?: {
    _id: string;
    name: string;
  };
  text?: string;
  content?: string; // Legacy support
  type?:
    | "text"
    | "image"
    | "call"
    | "audio"
    | "voice"
    | "gif"
    | "sticker"
    | "heart"
    | "post"
    | "system";
  attachment?: {
    url: string;
    publicId?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    size?: number;
    duration?: number;
  };
  // ✅ Added missing properties from backend model
  isDelivered?: boolean;
  deliveredAt?: string;
  isRead?: boolean;
  readAt?: string;
  deletedForEveryone?: boolean;
  deletedFor?: string[];
  callType?: "audio" | "video" | null;
  callStatus?: string;
  createdAt: string;
}

export interface ConversationSummary {
  _id: string;
  user: MessageUser;
  lastMessage?: ChatMessage | null;
  lastMessageAt?: string;
  unreadCount?: number;
  createdAt: string;
}

export async function fetchConversations(): Promise<{
  success: boolean;
  count: number;
  conversations: ConversationSummary[];
}> {
  const { data } = await api.get("/api/messages/conversations");
  return data;
}

export async function fetchMessages(
  conversationId: string,
  page = 1
): Promise<{ messages: ChatMessage[]; total: number; pagination: any }> {
  const { data } = await api.get(`/api/messages/${conversationId}`, {
    params: { page },
  });
  return data;
}

export async function sendChatMessage(
  conversationId: string,
  content: string,
  type = "text",
  attachment?: any
) {
  const { data } = await api.post(`/api/messages/${conversationId}`, {
    text: content,
    type,
    attachment,
  });
  return data;
}

export async function createConversation(matchId: string) {
  const { data } = await api.post(`/api/messages/conversations/${matchId}`);
  return data;
}

export async function deleteConversation(conversationId: string) {
  const { data } = await api.delete(
    `/api/messages/conversations/${conversationId}`
  );
  return data;
}

// ✅ ADDED: Delete message function (matches backend route)
export async function deleteMessage(
  messageId: string,
  scope: "me" | "everyone" = "me"
) {
  const { data } = await api.delete(`/api/messages/${messageId}`, {
    params: { scope },
  });
  return data;
}


export async function uploadChatAttachment(
  conversationId: string,
  fileUri: string,
  mimeType: string,
  fileName: string
): Promise<{ success: boolean; attachment: any }> {
  const formData = new FormData();
  formData.append("file", {
    uri: Platform.OS === "ios" ? fileUri.replace(/^file:\/\//, "") : fileUri,
    name: fileName,
    type: mimeType,
  } as any);
  formData.append("conversationId", conversationId);

  const { data } = await api.post("/api/messages/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return data;
}