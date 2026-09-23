import { useEffect, useRef, useCallback } from "react";
import { useSocket } from "./useSocket";
import { useAuth } from "../context/AuthContext.jsx";
import {
  unlockAudio,
  playNotificationSound,
  vibrate,
  showSystemNotification,
} from "../utils/alerts";

// ✅ Rate limiter: prevent sound/vibrate spam
const createRateLimiter = (minIntervalMs = 1000) => {
  let lastTriggered = 0;
  return () => {
    const now = Date.now();
    if (now - lastTriggered >= minIntervalMs) {
      lastTriggered = now;
      return true;
    }
    return false;
  };
};

export function useRealtimeAlerts() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const audioUnlockedRef = useRef(false);
  const userIdRef = useRef(user?._id?.toString());
  const processedEventsRef = useRef(new Set());

  // ✅ Keep userId ref in sync without triggering effect re-runs
  useEffect(() => {
    userIdRef.current = user?._id?.toString();
  }, [user?._id]);

  // ✅ Rate limiters for different alert types
  const messageRateLimit = useRef(createRateLimiter(800));
  const generalRateLimit = useRef(createRateLimiter(1500));

  /* 👇 Unlock AudioContext on first user gesture */
  useEffect(() => {
    if (audioUnlockedRef.current) return;

    const unlock = () => {
      unlockAudio();
      audioUnlockedRef.current = true;
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        unlockAudio();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // ✅ Clean up processed events set periodically to prevent memory growth
  useEffect(() => {
    const interval = setInterval(() => {
      processedEventsRef.current.clear();
    }, 60000); // Clear every 60 seconds
    return () => clearInterval(interval);
  }, []);

  // ✅ Stable alert trigger helper
  const triggerAlert = useCallback(
    ({ title, body, tag, url, vibrationPattern, isMessage }) => {
      // Deduplication: skip if we already processed this event
      if (tag && processedEventsRef.current.has(tag)) return;
      if (tag) processedEventsRef.current.add(tag);

      // Rate limiting
      const canTrigger = isMessage
        ? messageRateLimit.current()
        : generalRateLimit.current();
      if (!canTrigger) return;

      // Only play sound/vibrate if tab is NOT focused (user isn't looking)
      const isTabFocused = document.visibilityState === "visible";

      if (!isTabFocused) {
        playNotificationSound();
        vibrate(vibrationPattern || 150);
      }

      // Always show system notification (OS handles focus-based suppression)
      showSystemNotification({ title, body, tag, url });
    },
    []
  );

  useEffect(() => {
    if (!socket || !userIdRef.current) return;

    /* 💬 NEW MESSAGE via conversation_updated */
    const handleConversationUpdated = ({ conversationId, message }) => {
      if (!message) return;

      // Skip own messages (read from ref to avoid stale closure)
      if (!userIdRef.current) return;
      const senderId =
        typeof message.sender === "string"
          ? message.sender
          : message.sender?._id?.toString?.();
      if (senderId === userIdRef.current) return;

      // ✅ Skip if currently viewing THIS chat
      const activeChatId = sessionStorage.getItem("activeChatId");
      if (activeChatId === conversationId) return;

      const bodyMap = {
        text: message.text,
        image: "📷 Photo",
        voice: "🎤 Voice message",
        heart: "❤️ Sent love",
        sticker: "🎨 Sticker",
        gif: "🎬 GIF",
        post: "📤 Shared post",
      };
      const body = bodyMap[message.type] || "New message";
      const senderName = message.sender?.name || "New message 💬";

      triggerAlert({
        title: senderName,
        body,
        tag: message._id?.toString?.() || conversationId,
        url: "/messages",
        isMessage: true,
      });
    };

    /* 🔔 NOTIFICATION (like, match, comment, etc.) */
    const handleNotification = (n) => {
      triggerAlert({
        title: "Maya~Milan 💕",
        body: `${n.sender?.name || "Someone"} ${
          n.message || "sent you something"
        }`,
        tag: n._id?.toString?.(),
        url: "/notifications",
      });
    };

    /* 💕 NEW MATCH */
    const handleNewMatch = () => {
      triggerAlert({
        title: "It's a Match! 💕",
        body: "Someone liked you back. Start chatting!",
        tag: `new-match-${Date.now()}`,
        url: "/messages",
        vibrationPattern: [200, 100, 200, 100, 200],
      });
    };

    /* 📸 NEW POST (from a match) */
    const handleNewPost = ({ postId, author, content }) => {
      triggerAlert({
        title: `${author?.name || "Someone"} shared a new post 📸`,
        body: content || "Tap to view their post",
        tag: postId,
        url: "/feed",
      });
    };

    /* ✨ PROFILE UPDATED (by a match) */
    const handleProfileUpdated = ({ userId, name }) => {
      if (userId === userIdRef.current) return;

      triggerAlert({
        title: `${name} updated their profile ✨`,
        body: "Tap to see what's new",
        tag: `profile-${userId}`,
        url: `/users/${userId}`,
      });
    };

    /* 💕 NEW MEMBER JOINED */
    const handleNewMember = ({ userId, name }) => {
      triggerAlert({
        title: "New member joined 💕",
        body: `${name} just joined Maya~Milan`,
        tag: `new-member-${userId}`,
        url: `/users/${userId}`,
      });
    };

    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("new_notification", handleNotification);
    socket.on("new_match", handleNewMatch);
    socket.on("new_post", handleNewPost);
    socket.on("profile_updated", handleProfileUpdated);
    socket.on("new_member", handleNewMember);

    return () => {
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("new_notification", handleNotification);
      socket.off("new_match", handleNewMatch);
      socket.off("new_post", handleNewPost);
      socket.off("profile_updated", handleProfileUpdated);
      socket.off("new_member", handleNewMember);
    };
  }, [socket, triggerAlert]); // ✅ No `user` dependency — uses ref instead
}
