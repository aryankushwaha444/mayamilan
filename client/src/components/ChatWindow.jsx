import { useEffect, useRef, useState, useCallback } from "react";
import ChatInputBar from "./ChatInputBar.jsx";
import MessageBubble from "./MessageBubble.jsx";
import PhotoLightbox from "./PhotoLightbox.jsx";
import { avatarImg } from "../utils/cloudinary";
import { useAlert } from "../context/AlertContext";
import {
  getMessages,
  sendMessage,
  uploadChatAttachment,
  reactToMessage,
  deleteMessage,
  markMessageAsRead,
} from "../services/messageService.js";
import { useSocket } from "../hooks/useSocket.js";

const MESSAGES_PER_PAGE = 50;

function ChatWindow({ conversationId, currentUserId, otherUser, onBack }) {
  const { socket } = useSocket();
  const toast = useAlert();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());

  const scrollRef = useRef(null);
  const isInitialLoad = useRef(true);
  const readRequestedRef = useRef(new Set());
  const typingTimeoutRef = useRef(null);

  // LOAD MESSAGES (with pagination)
  const loadMessages = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        if (pageNum === 1) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        const data = await getMessages(conversationId, {
          page: pageNum,
          limit: MESSAGES_PER_PAGE,
        });

        const newMessages = data.messages || [];

        if (append) {
          setMessages((prev) => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
        }

        setHasMore(newMessages.length === MESSAGES_PER_PAGE);
        setPage(pageNum);
      } catch (err) {
        console.error("Load messages error:", err);
        toast.error("Failed to load messages");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [conversationId, toast]
  );

  useEffect(() => {
    if (!conversationId) return;
    isInitialLoad.current = true;
    setMessages([]);
    setHasMore(true);
    setPage(1);
    loadMessages(1, false);
  }, [conversationId, loadMessages]);

  // Track active chat ID
  useEffect(() => {
    if (conversationId) {
      sessionStorage.setItem("activeChatId", conversationId);
    }
    return () => {
      sessionStorage.removeItem("activeChatId");
    };
  }, [conversationId]);

  // AUTO-SCROLL
  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;

    if (isInitialLoad.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isInitialLoad.current = false;
    } else {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (isNearBottom) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      } else {
        setShowScrollButton(true);
      }
    }
  }, [messages]);

  // Handle scroll for pagination + scroll button
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Show/hide scroll-to-bottom button
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShowScrollButton(!isNearBottom);

    // Load more messages when scrolling up
    if (scrollTop < 50 && hasMore && !loadingMore) {
      loadMessages(page + 1, true);
    }
  }, [hasMore, loadingMore, page, loadMessages]);

  // Mobile keyboard resize handler
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    };

    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Reset read-requested tracker
  useEffect(() => {
    readRequestedRef.current = new Set();
  }, [conversationId]);

  // MARK AS READ
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

      if (readRequestedRef.current.has(messageId)) return;
      readRequestedRef.current.add(messageId);
      socket.emit("mark_read", { messageId });
      markMessageAsRead(messageId).catch(() => {});
    });

    if (pending.length > 0) {
      window.dispatchEvent(new CustomEvent("chat:messages-read"));
    }
  }, [messages, conversationId, currentUserId, socket]);

  // SOCKET EVENTS
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit("join_conversation", conversationId);

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

      const receiverId =
        typeof msg.receiver === "string"
          ? msg.receiver
          : msg.receiver?._id?.toString?.();

      if (receiverId === currentUserId) {
        const messageId =
          typeof msg._id === "string" ? msg._id : msg._id?.toString?.();

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

    // ✅ NEW: Typing indicator
    const handleTyping = ({ userId, isTyping }) => {
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (isTyping) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_delivered", handleDelivered);
    socket.on("message_read", handleRead);
    socket.on("message_reacted", handleReacted);
    socket.on("message_deleted", handleDeleted);
    socket.on("user_typing", handleTyping);

    return () => {
      socket.emit("leave_conversation", conversationId);
      socket.off("new_message", handleNewMessage);
      socket.off("message_delivered", handleDelivered);
      socket.off("message_read", handleRead);
      socket.off("message_reacted", handleReacted);
      socket.off("message_deleted", handleDeleted);
      socket.off("user_typing", handleTyping);
    };
  }, [socket, conversationId, currentUserId]);

  // SEND MESSAGE (with retry)
  const handleSend = async ({
    type = "text",
    text = "",
    file = null,
    attachment = null,
  }) => {
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
      sending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      setSending(true);
      let att = attachment;

      if (file) {
        const up = await uploadChatAttachment(file);
        att = up.attachment;
      }

      const response = await sendMessage(conversationId, {
        text,
        type,
        attachment: att,
      });

      // ✅ Replace optimistic message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId ? { ...response.message, sending: false } : m
        )
      );
    } catch (err) {
      console.error("Send error:", err);
      toast.error("Failed to send message. Tap to retry.");

      setMessages((prev) =>
        prev.map((m) =>
          m._id === tempId ? { ...m, failed: true, sending: false } : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  // ✅ NEW: Retry failed message
  const handleRetry = async (failedMessage) => {
    setMessages((prev) =>
      prev.map((m) =>
        m._id === failedMessage._id ? { ...m, failed: false, sending: true } : m
      )
    );

    try {
      const response = await sendMessage(conversationId, {
        text: failedMessage.text,
        type: failedMessage.type,
        attachment: failedMessage.attachment,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m._id === failedMessage._id
            ? { ...response.message, sending: false }
            : m
        )
      );
    } catch (err) {
      toast.error("Retry failed. Please try again.");
      setMessages((prev) =>
        prev.map((m) =>
          m._id === failedMessage._id
            ? { ...m, failed: true, sending: false }
            : m
        )
      );
    }
  };

  // REACTIONS & DELETE
  const handleReact = async (messageId, emoji) => {
    try {
      await reactToMessage(messageId, emoji);
    } catch (e) {
      toast.error("Failed to add reaction");
    }
  };

  const handleDeleteMessage = async (messageId, scope) => {
    try {
      await deleteMessage(messageId, scope);
      if (scope === "me") {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to delete message");
    }
  };

  // LIGHTBOX HANDLER
  const handleImageClick = (url) => {
    setLightbox({ photos: [url], index: 0 });
  };

  // ✅ NEW: Scroll to bottom
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
      setShowScrollButton(false);
    }
  };

  // ✅ NEW: Handle typing indicator
  const handleTypingStart = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket?.emit("typing_start", { conversationId });

    typingTimeoutRef.current = setTimeout(() => {
      socket?.emit("typing_stop", { conversationId });
    }, 2000);
  };

  // Group messages by date
  const groupMessagesByDate = (msgs) => {
    const groups = [];
    let currentDate = null;

    msgs.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toDateString();

      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ type: "date", date: msgDate });
      }

      groups.push({ type: "message", data: msg });
    });

    return groups;
  };

  const groupedMessages = groupMessagesByDate(
    messages.filter((m) => !m.deletedFor?.includes(currentUserId))
  );

  const isOtherUserTyping = typingUsers.has(otherUser?._id?.toString());

  // RENDER
  return (
    <div className="chat-window">
      {/* HEADER */}
      <div className="chat-header" role="banner">
        <button
          className="chat-back-btn"
          onClick={onBack}
          aria-label="Go back to conversations"
        >
          <i className="bi bi-arrow-left" aria-hidden="true"></i>
        </button>

        <div className="chat-header-user">
          <div className="chat-header-avatar">
            {otherUser?.photos?.[0]?.url ? (
              <img
                src={avatarImg(otherUser.photos[0].url)}
                alt={`${otherUser.name}'s avatar`}
              />
            ) : (
              <span aria-hidden="true">
                {otherUser?.name?.charAt(0) || "?"}
              </span>
            )}
            {otherUser?.isOnline && (
              <span className="online-dot" aria-label="Online"></span>
            )}
          </div>
          <div>
            <strong>{otherUser?.name}</strong>
            <small>
              {isOtherUserTyping
                ? "Typing..."
                : otherUser?.isOnline
                ? "Active now"
                : otherUser?.lastSeen
                ? `Last seen ${new Date(otherUser.lastSeen).toLocaleTimeString(
                    [],
                    { hour: "2-digit", minute: "2-digit" }
                  )}`
                : "Offline"}
            </small>
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div
        className="chat-messages"
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {loading ? (
          <div className="chat-loading" aria-label="Loading messages">
            <div className="spinner-border spinner-border-sm text-primary"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon" aria-hidden="true">
              💬
            </div>
            <p>
              Start your conversation with <strong>{otherUser?.name}</strong>
            </p>
          </div>
        ) : (
          <>
            {loadingMore && (
              <div
                className="chat-loading-more"
                aria-label="Loading older messages"
              >
                <div className="spinner-border spinner-border-sm text-primary"></div>
              </div>
            )}

            {groupedMessages.map((item, idx) => {
              if (item.type === "date") {
                const isToday = item.date === new Date().toDateString();
                const isYesterday =
                  item.date === new Date(Date.now() - 86400000).toDateString();

                return (
                  <div key={`date-${idx}`} className="chat-date-separator">
                    <span>
                      {isToday
                        ? "Today"
                        : isYesterday
                        ? "Yesterday"
                        : new Date(item.date).toLocaleDateString()}
                    </span>
                  </div>
                );
              }

              const m = item.data;
              return (
                <MessageBubble
                  key={m._id}
                  message={m}
                  isMine={
                    (typeof m.sender === "string"
                      ? m.sender
                      : m.sender?._id) === currentUserId
                  }
                  onReact={(emoji) => handleReact(m._id, emoji)}
                  onDelete={(scope) => handleDeleteMessage(m._id, scope)}
                  onImageClick={handleImageClick}
                  onRetry={() => handleRetry(m)}
                  sending={m.sending}
                  failed={m.failed}
                />
              );
            })}

            {isOtherUserTyping && (
              <div
                className="chat-typing-indicator"
                aria-label="Other user is typing"
              >
                <span className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                <small>{otherUser?.name} is typing...</small>
              </div>
            )}
          </>
        )}
      </div>

      {/* ✅ Scroll to bottom button */}
      {showScrollButton && (
        <button
          className="chat-scroll-to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to latest messages"
        >
          <i className="bi bi-chevron-down"></i>
        </button>
      )}

      {/* INPUT */}
      <ChatInputBar
        onSend={handleSend}
        disabled={sending}
        onTyping={handleTypingStart}
      />

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
