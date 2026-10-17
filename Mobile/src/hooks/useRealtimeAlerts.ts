// src/hooks/useRealtimeAlerts.ts
// In-app realtime channel: transient toasts for the SIX backend socket events the web
// useRealtimeAlerts.js handles (conversation_updated, new_notification, new_match, new_post,
// profile_updated, new_member), plus a debounced REST re-sync so the persisted badge/list
// live-update. Complementary to usePushNotifications (OS-level push).
//
// WHY the rewrite (certified against the web handler bodies, not inferred):
//  - The web's `triggerAlert({title,body,tag,url})` is its INTERNAL toast-bus; the SOCKET
//    payload is the raw backend emission (lean: sender/message/_id), which is a DIFFERENT
//    shape from the persisted REST doc (rich: title/body). So toasts are built from the
//    web-exact lean fields, and the badge is re-synced from REST via refresh() — we never
//    depend on the socket carrying title/body.
//  - The old hook listened to only new_notification and pushed it through normalizeAlert
//    (which needs title||body) -> a lean `n` was silently dropped, so the badge never
//    live-updated while open. Fixed by: toast from lean fields + debounced refresh.
//  - read/delete are LOCAL+API (web does the same via optimistic state), so the three
//    speculative socket read/delete listeners are removed (unverified contract).
//
// SECURITY: every payload is read with optional chaining and capped; ids that reach a
// navigate/path are validated isObjectId by the CONSUMER (this hook does not navigate — it
// only toasts + refreshes, so a rogue/compromised socket message cannot inject a route, a
// remote URL, or attacker text longer than the caps; it can at most produce a benign toast).
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./useSocket";
import { useAlert } from "../context/AlertContext";
import { useAuth } from "../context/AuthContext";
import { isObjectId } from "../utils/media";
import { notifySuccess } from "../lib/haptics"; // lazy-guarded; no-ops if expo-haptics absent
import {
  listNotifications,
  markRead as apiMarkRead,
  markAllRead as apiMarkAllRead,
} from "../api/notifications";
import type { AppNotification, NotificationType } from "../types/notification";

const VALID_TYPES: ReadonlySet<string> = new Set<NotificationType>([
  "like",
  "match",
  "message",
  "comment",
  "system",
  "call",
  "verification",
]);
const TITLE_MAX = 120;
const BODY_MAX = 280;
const TOAST_MAX = 200;
const REFRESH_DEBOUNCE_MS = 500; // coalesce a burst of new_notification into one REST fetch

interface NormalizedAlert {
  _id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  entityId?: string;
  conversationId?: string;
  actorId?: string;
}

// REST-list normalizer ONLY (persisted docs carry _id + title/body). Socket toasts do NOT
// pass through here — they are built from the lean web fields to avoid the shape mismatch.
function normalizeAlert(raw: any): NormalizedAlert | null {
  if (!raw || typeof raw !== "object") return null;
  const id = raw._id ?? raw.id;
  if (!isObjectId(id)) return null;
  const type = VALID_TYPES.has(raw.type)
    ? (raw.type as NotificationType)
    : "system";
  const title =
    typeof raw.title === "string" ? raw.title.slice(0, TITLE_MAX) : "";
  const body = typeof raw.body === "string" ? raw.body.slice(0, BODY_MAX) : "";
  if (!title && !body) return null;
  const strOpt = (v: unknown) => (isObjectId(v) ? (v as string) : undefined);
  return {
    _id: id as string,
    type,
    title,
    body,
    read: !!raw.read,
    createdAt:
      typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString(),
    entityId: strOpt(raw.entityId),
    conversationId: strOpt(raw.conversationId),
    actorId: strOpt(raw.actorId),
  };
}

const clamp = (s: unknown, max: number) =>
  typeof s === "string" ? s.slice(0, max) : "";

export function useRealtimeAlerts() {
  const { socket } = useSocket();
  const toast = useAlert();
  const { user } = useAuth();
  const currentUserId = user?._id ? String(user._id) : "";

  const [alerts, setAlerts] = useState<NormalizedAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listNotifications(1);
      const list = (res?.notifications ?? [])
        .map(normalizeAlert)
        .filter(Boolean) as NormalizedAlert[];
      setAlerts(list);
      setUnreadCount(list.filter((a) => !a.read).length);
    } catch {
      // generic only; never leak server error text (enumeration / internals)
      setAlerts([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // debounced re-sync so a burst of likes/matches/comments => ONE REST fetch (no storm/429)
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // initial load + re-sync on (re)connect, so the badge is correct after a socket drop
  useEffect(() => {
    void refresh();
  }, [refresh, socket?.connected]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    []
  );

  // ---- the SIX transient toasts, strings ported VERBATIM from the web handlers ----
  useEffect(() => {
    if (!socket) return;

    // conversation_updated: arity-tolerant (server may emit (message, conversationId) OR
    // ({message, conversationId})); the toast needs ONLY `message`, so extract it from either.
    const onConversation = (...args: any[]) => {
      const raw = args[0];
      const message =
        args.length >= 2
          ? raw
          : raw &&
            typeof raw === "object" &&
            (raw as any).message &&
            typeof (raw as any).message === "object"
          ? (raw as any).message
          : raw;
      if (!message || typeof message !== "object") return;
      const senderId =
        typeof message.sender === "string"
          ? message.sender
          : message.sender?._id?.toString?.();
      if (currentUserId && senderId === currentUserId) return; // skip own (web parity)
      const bodyMap: Record<string, string | undefined> = {
        text: typeof message.text === "string" ? message.text : undefined,
        image: "📷 Photo",
        voice: "🎤 Voice message",
        heart: "❤️ Sent love",
        sticker: "🎨 Sticker",
        gif: "🎬 GIF",
        post: "📤 Shared post",
      };
      const body = clamp(bodyMap[message.type] || "New message", 160);
      const title = clamp(message.sender?.name, 60) || "New message 💬";
      toast.info(body ? `${title} — ${body}` : title);
      // NOTE: web also suppresses when viewing THIS chat (sessionStorage activeChatId). Mobile
      // has no shared active-chat registry yet (needs the hook hoisted to a single context
      // instance), so an in-chat toast may occasionally appear — minor, documented, not a bug.
    };

    // new_notification: lean socket shape (sender/message) -> toast from those; badge via
    // debounced REST refresh (rich title/body come from the persisted doc, not the socket).
    const onNotification = (n: any) => {
      const senderName = clamp(n?.sender?.name, 60) || "Someone";
      const msg = clamp(n?.message, 160);
      const body =
        [senderName, msg].filter(Boolean).join(" ").slice(0, TOAST_MAX) ||
        clamp(n?.title, TOAST_MAX) ||
        clamp(n?.body, TOAST_MAX) ||
        "New activity";
      toast.info(`Maya~Milan 💕 — ${body}`);
      scheduleRefresh();
    };

    const onMatch = () => {
      toast.info("It's a Match! 💕 — Someone liked you back. Start chatting!");
      notifySuccess(); // lazy haptic; no-ops when expo-haptics is absent
    };

    const onPost = (p: any) => {
      const author = clamp(p?.author?.name, 60) || "Someone";
      const content = clamp(p?.content, 160) || "Tap to view their post";
      toast.info(`${author} shared a new post 📸 — ${content}`);
    };

    const onProfile = (p: any) => {
      if (currentUserId && String(p?.userId) === currentUserId) return; // skip own (web parity)
      const name = clamp(p?.name, 60) || "Someone";
      toast.info(`${name} updated their profile ✨ — Tap to see what's new`);
    };

    const onMember = (p: any) => {
      const name = clamp(p?.name, 60) || "Someone";
      toast.info(`New member joined 💕 — ${name} just joined Maya~Milan`);
    };

    socket.on("conversation_updated", onConversation);
    socket.on("new_notification", onNotification);
    socket.on("new_match", onMatch);
    socket.on("new_post", onPost);
    socket.on("profile_updated", onProfile);
    socket.on("new_member", onMember);

    return () => {
      socket.off("conversation_updated", onConversation);
      socket.off("new_notification", onNotification);
      socket.off("new_match", onMatch);
      socket.off("new_post", onPost);
      socket.off("profile_updated", onProfile);
      socket.off("new_member", onMember);
    };
  }, [socket, toast, currentUserId, scheduleRefresh]);

  const markRead = useCallback(async (id: string) => {
    if (!isObjectId(id)) return;
    setAlerts((prev) =>
      prev.map((x) => (x._id === id ? { ...x, read: true } : x))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiMarkRead(id);
    } catch {
      /* optimistic; reconcile on next refresh */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setAlerts((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    try {
      await apiMarkAllRead();
    } catch {
      /* optimistic */
    }
  }, []);

  return { alerts, unreadCount, loading, refresh, markRead, markAllRead };
}

export default useRealtimeAlerts;
