import { useEffect, useRef } from "react";
import { useSocket } from "./useSocket";
import { useAuth } from "../context/AuthContext.jsx";
import {
  unlockAudio,
  playNotificationSound,
  vibrate,
  showSystemNotification,
} from "../utils/alerts";

export function useRealtimeAlerts() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const audioUnlockedRef = useRef(false);

  /* 👇 Unlock AudioContext on first user gesture (Safari/Brave require this) */
  useEffect(() => {
    if (audioUnlockedRef.current) return;

    const unlock = () => {
      unlockAudio(); // 👈 Call the exported function (uses shared context)
      audioUnlockedRef.current = true;
    };

    // Safari iOS fires pointerdown/touchstart; desktop fires click/keydown
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    // Safari suspends AudioContext when tab is hidden — re-resume on return
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

  useEffect(() => {
    if (!socket || !user?._id) return;

    const myId = user._id.toString();

    // Helper: safe ID comparison (handles string, ObjectId, or nested _id)
    const sameId = (a, b) => {
      if (!a || !b) return false;
      const idA =
        typeof a === "string" ? a : a?._id?.toString?.() || a?.toString?.();
      const idB =
        typeof b === "string" ? b : b?._id?.toString?.() || b?.toString?.();
      return idA === idB;
    };

    /* 💬 NEW MESSAGE — via conversation_updated (ALWAYS reaches receiver) */
    const handleConversationUpdated = ({ conversationId, message }) => {
      if (!message) return;

      // Skip my own messages (sent from another tab/device)
      if (sameId(message.sender, myId)) return;

      // Skip if currently viewing THIS chat (they see it live, sound would be annoying)
      const currentChatId = window.location.pathname.includes("/messages")
        ? sessionStorage.getItem("activeChatId")
        : null;
      if (currentChatId === conversationId) return;

      const body =
        message.type === "text"
          ? message.text
          : message.type === "image"
          ? "📷 Photo"
          : message.type === "voice"
          ? "🎤 Voice message"
          : message.type === "heart"
          ? "❤️ Sent love"
          : message.type === "sticker"
          ? "🎨 Sticker"
          : message.type === "gif"
          ? "🎬 GIF"
          : message.type === "post"
          ? "📤 Shared post"
          : "New message";

      // Play sound + vibrate
      playNotificationSound();
      vibrate();

      // Show system notification banner
      const senderName = message.sender?.name || "New message 💬";
      showSystemNotification({
        title: senderName,
        body,
        tag: message._id?.toString?.() || conversationId,
        url: "/messages",
      });
    };

    /* 🔔 NOTIFICATION (like, match, comment, etc.) */
    const handleNotification = (n) => {
      playNotificationSound();
      vibrate(150);
      showSystemNotification({
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
      playNotificationSound();
      vibrate([200, 100, 200, 100, 200]);
      showSystemNotification({
        title: "It's a Match! 💕",
        body: "Someone liked you back. Start chatting!",
        tag: "new-match",
        url: "/messages",
      });
    };

    /* 📸 NEW POST (from a match) */
    const handleNewPost = ({ postId, author, content }) => {
      playNotificationSound();
      vibrate(100);
      showSystemNotification({
        title: `${author?.name || "Someone"} shared a new post 📸`,
        body: content || "Tap to view their post",
        tag: postId,
        url: "/feed",
      });
    };

    /* ✨ PROFILE UPDATED (by a match) */
    const handleProfileUpdated = ({ userId, name, photos, updatedFields }) => {
      // Don't notify about my own updates
      if (userId === myId) return;

      playNotificationSound();
      vibrate(100);
      showSystemNotification({
        title: `${name} updated their profile ✨`,
        body: "Tap to see what's new",
        tag: `profile-${userId}`,
        url: `/users/${userId}`,
      });
    };

    /* 💕 NEW MEMBER JOINED */
    const handleNewMember = ({ userId, name, photos }) => {
      playNotificationSound();
      vibrate(100);
      showSystemNotification({
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
  }, [socket, user]);
}
