// src/types/notification.ts
export type NotificationType =
  | "like"
  | "match"
  | "message"
  | "comment"
  | "system"
  | "call"
  | "verification";
export interface AppNotification {
  _id: string;
  type: NotificationType;
  title: string;
  body?: string;
  actorId?: string;
  actorName?: string;
  entityId?: string;
  conversationId?: string;
  read?: boolean;
  createdAt: string;
  deepLink?: string;
}
