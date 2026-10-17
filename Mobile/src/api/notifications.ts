// src/api/notifications.ts — push token is a STRING passed in by the (lazy) hook;
// this file never imports expo-notifications (not installed → would crash tsc/runtime).
import { api } from "./client";
import { isObjectId } from "../utils/media";
import type { AppNotification } from "../types/notification";
export async function listNotifications(page = 1) {
  const { data } = await api.get("/api/notifications", { params: { page } });
  return data as { notifications: AppNotification[]; hasMore: boolean };
}
export async function markRead(id: string) {
  if (!isObjectId(id)) throw new Error("bad id");
  const { data } = await api.patch(`/api/notifications/${id}/read`);
  return data;
}
export async function markAllRead() {
  const { data } = await api.patch("/api/notifications/read-all");
  return data;
}
export async function registerPushToken(
  token: string,
  platform: "ios" | "android"
) {
  if (typeof token !== "string" || !token) throw new Error("bad token");
  const { data } = await api.post("/api/notifications/push-token", {
    token,
    platform,
  });
  return data;
}
export async function unregisterPushToken(token: string) {
  const { data } = await api.delete("/api/notifications/push-token", {
    data: { token },
  });
  return data;
}
