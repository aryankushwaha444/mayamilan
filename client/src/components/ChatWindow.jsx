import { useEffect, useRef, useState } from "react";
import ChatInputBar from "./ChatInputBar.jsx";
import MessageBubble from "./MessageBubble.jsx";
import PhotoLightbox from "./PhotoLightbox.jsx";
import {
  getMessages,
  sendChatMessage,
  uploadChatAttachment,
  reactToMessage,
  deleteMessage,
  markMessageAsRead,
} from "../services/messageService.js";
import { useSocket } from "../hooks/useSocket.js";

function ChatWindow({ conversationId, currentUserId, otherUser, onBack }) {
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const scrollRef = useRef(null);
  const isInitialLoad = useRef(true);
  const readRequestedRef = useRef(new Set()); // NEW: prevent infinite mark-read spam

  //  LOAD MESSAGES
  const loadMessages = async () => {
    try {
      const data = await getMessages(conversationId);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Load messages error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    isInitialLoad.current = true;
    setMessages([]);
    loadMessages();
  }, [conversationId]);

  //  AUTO-SCROLL
  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;

    if (isInitialLoad.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isInitialLoad.current = false;
    } else {
      // smooth scroll for new messages
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  //  NEW: reset read-requested tracker when conversation changes
  useEffect(() => {
    readRequestedRef.current = new Set();
  }, [conversationId]);

  //  MARK AS READ (socket = real-time, HTTP = DB backup)
  useEffect(() => {
    if (!socket || !conversationId || messages.length === 0) return;

    const pending = messages.filter((m) => {
      const receiverId =
        typeof m.receiver === "string"
          ? m.receiver
          : m.receiver?._id?.toString?.();

      return (
        receiverId === currentUserId &&
        !m.deletedForEveryone &&
        (!m.isRead || !m.isDelivered)
      );
    });

    pending.forEach((m) => {
      const messageId = typeof m._id === "string" ? m._id : m._id?.toString?.();

      // 👇 NEW: guard to prevent infinite loop
      if (readRequestedRef.current.has(messageId)) return;
      readRequestedRef.current.add(messageId);
      socket.emit("mark_read", { messageId });
      markMessageAsRead(messageId).catch(() => {});
    });

    // NEW: tell Navbar to refresh badge instantly
    if (pending.length > 0) {
      window.dispatchEvent(new CustomEvent("chat:messages-read"));
    }
  }, [messages, conversationId, currentUserId, socket]);

  //  SOCKET EVENTS (with bulletproof ID matching)
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit("join_conversation", conversationId);

    // Safe ID comparison for ALL types (string, ObjectId, nested _id)
    const sameId = (a, b) => {
      const idA =
        typeof a === "string" ? a : a?._id?.toString?.() || a?.toString?.();
      const idB =
        typeof b === "string" ? b : b?._id?.toString?.() || b?.toString?.();
      return idA === idB;
    };

    const handleNewMessage = (msg) => {
      const msgConvId =
        typeof msg.conversation === "string"
          ? msg.conversation
          : msg.conversation?._id?.toString?.();

      if (msgConvId !== conversationId) return;

      setMessages((prev) => {
        if (prev.some((m) => sameId(m._id, msg._id))) return prev;
        return [...prev, msg];
      });

      // Auto-mark as read if chat is open
      const receiverId =
        typeof msg.receiver === "string"
          ? msg.receiver
          : msg.receiver?._id?.toString?.();

      if (receiverId === currentUserId) {
        const messageId =
          typeof msg._id === "string" ? msg._id : msg._id?.toString?.();

        // NEW: guard here too
        if (!readRequestedRef.current.has(messageId)) {
          readRequestedRef.current.add(messageId);
          socket.emit("mark_read", { messageId });
          markMessageAsRead(msg._id).catch(() => {});
        }
      }
    };

    const handleDelivered = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          sameId(m._id, messageId) ? { ...m, isDelivered: true } : m
        )
      );
    };

    const handleRead = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          sameId(m._id, messageId)
            ? { ...m, isRead: true, isDelivered: true, readAt: new Date() }
            : m
        )
      );
    };

    const handleReacted = ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => (sameId(m._id, messageId) ? { ...m, reactions } : m))
      );
    };

    const handleDeleted = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          sameId(m._id, messageId) ? { ...m, deletedForEveryone: true } : m
        )
      );
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_delivered", handleDelivered);
    socket.on("message_read", handleRead);
    socket.on("message_reacted", handleReacted);
    socket.on("message_deleted", handleDeleted);

    return () => {
      socket.emit("leave_conversation", conversationId);
      socket.off("new_message", handleNewMessage);
      socket.off("message_delivered", handleDelivered);
      socket.off("message_read", handleRead);
      socket.off("message_reacted", handleReacted);
      socket.off("message_deleted", handleDeleted);
    };
  }, [socket, conversationId, currentUserId]);

  //  SEND MESSAGE (all types)
  const handleSend = async ({
    type = "text",
    text = "",
    file = null,
    attachment = null,
  }) => {
    // 1. Create a temporary message to show immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      _id: tempId,
      text,
      type,
      attachment,
      sender: currentUserId,
      receiver: otherUser?._id,
      createdAt: new Date(),
      isDelivered: false,
      isRead: false,
      failed: false,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      setSending(true);
      let att = attachment;

      if (file) {
        const up = await uploadChatAttachment(file);
        att = up.attachment;
      }

      await sendChatMessage(conversationId, { text, type, attachment: att });

      // Success: Remove temp message (the real one will arrive via Socket)
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
    } catch (err) {
      console.error("Send error:", err);

      // Failure: Mark the temporary message as failed (turns red)
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, failed: true } : m))
      );
    } finally {
      setSending(false);
    }
  };

  //  REACTIONS & DELETE
  const handleReact = async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji);
    } catch (e) {
      console.error("React error:", e);
    }
  };

  const handleDeleteMessage = async (messageId, scope) => {
    try {
      await deleteMessage(messageId, scope);
      if (scope === "me") {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
      // "everyone" deletion is handled by socket event
    } catch (e) {
      alert(e.response?.data?.message || "Failed to delete");
    }
  };

  //  LIGHTBOX HANDLER
  const handleImageClick = (url) => {
    setLightbox({ photos: [url], index: 0 });
  };

  //  RENDER
  return (
    <div className="chat-window">
      {/* HEADER */}
      <div className="chat-header">
        <button className="chat-back-btn" onClick={onBack}>
          <i className="bi bi-arrow-left"></i>
        </button>

        <div className="chat-header-user">
          <div className="chat-header-avatar">
            {otherUser?.photos?.[0]?.url ? (
              <img src={otherUser.photos[0].url} alt={otherUser.name} />
            ) : (
              <span>{otherUser?.name?.charAt(0) || "?"}</span>
            )}
            {otherUser?.isOnline && <span className="online-dot"></span>}
          </div>
          <div>
            <strong>{otherUser?.name}</strong>
            <small>
              {otherUser?.isOnline
                ? "Active now"
                : otherUser?.lastSeen
                ? `Last seen ${new Date(otherUser.lastSeen).toLocaleTimeString(
                    [],
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}`
                : "Offline"}
            </small>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="chat-messages" ref={scrollRef}>
        {loading ? (
          <div className="chat-loading">
            <div className="spinner-border spinner-border-sm text-primary"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>
              Start your conversation with <strong>{otherUser?.name}</strong>
            </p>
          </div>
        ) : (
          messages
            .filter((m) => !m.deletedFor?.includes(currentUserId))
            .map((m) => (
              <MessageBubble
                key={m._id}
                message={m}
                isMine={
                  (typeof m.sender === "string" ? m.sender : m.sender?._id) ===
                  currentUserId
                }
                onReact={(emoji) => handleReact(m._id, emoji)}
                onDelete={(scope) => handleDeleteMessage(m._id, scope)}
                onImageClick={handleImageClick}
              />
            ))
        )}
      </div>

      {/* INPUT */}
      <ChatInputBar onSend={handleSend} disabled={sending} />

      {/* LIGHTBOX */}
      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

export default ChatWindow;
