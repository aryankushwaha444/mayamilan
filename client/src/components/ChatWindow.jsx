import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
const MAX_TEXT = 2000;

// Defence-in-depth: even though the server normalises URLs, never render a
// javascript:/data:/non-allow-listed host from a socket/HTTP payload.
const MEDIA_HOSTS = [
  /([a-z0-9-]+\.)?cloudinary\.com$/i,
  /^media\.giphy\.com$/i,
  /^i\.giphy\.com$/i,
  /^media-0\.giphy\.com$/i,
  /^media\d*\.tenor\.com$/i,
  /([a-z0-9-]+\.)?tenor\.googleusercontent\.com$/i,
];
const isSafeUrl = (u) => {
  if (typeof u !== "string" || !u) return false;
  try {
    const p = new URL(u);
    return (
      (p.protocol === "https:" || p.protocol === "http:") &&
      MEDIA_HOSTS.some((r) => r.test(p.hostname))
    );
  } catch {
    return false;
  }
};

// Whitelist message fields coming from socket/HTTP → drops unknown keys
// (anti mass-assignment / anti prototype-propagation into React state).
const pickMessage = (m) => {
  if (!m || typeof m !== "object") return m;
  const out = {
    _id: m._id,
    conversation: m.conversation,
    sender: m.sender,
    receiver: m.receiver,
    text: typeof m.text === "string" ? m.text.slice(0, MAX_TEXT) : "",
    type: m.type,
    isDelivered: !!m.isDelivered,
    deliveredAt: m.deliveredAt || null,
    isRead: !!m.isRead,
    readAt: m.readAt || null,
    deletedForEveryone: !!m.deletedForEveryone,
    deletedFor: Array.isArray(m.deletedFor) ? m.deletedFor : [],
    isEdited: !!m.isEdited,
    editedAt: m.editedAt || null,
    createdAt: m.createdAt,
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    post: m.post || null,
  };
  if (m.attachment && typeof m.attachment === "object") {
    out.attachment = {
      url: isSafeUrl(m.attachment.url) ? m.attachment.url : null,
      publicId:
        typeof m.attachment.publicId === "string"
          ? m.attachment.publicId
          : null,
      mimeType:
        typeof m.attachment.mimeType === "string"
          ? m.attachment.mimeType
          : null,
      width: Number.isFinite(+m.attachment.width) ? +m.attachment.width : null,
      height: Number.isFinite(+m.attachment.height)
        ? +m.attachment.height
        : null,
      duration: Number.isFinite(+m.attachment.duration)
        ? +m.attachment.duration
        : 0,
      size: Number.isFinite(+m.attachment.size) ? +m.attachment.size : null,
      thumbnailUrl: isSafeUrl(m.attachment.thumbnailUrl)
        ? m.attachment.thumbnailUrl
        : null,
    };
  } else out.attachment = null;
  return out;
};

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
  const sendingRef = useRef(false);

  const loadMessages = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        pageNum === 1 ? setLoading(true) : setLoadingMore(true);
        const data = await getMessages(conversationId, {
          page: pageNum,
          limit: MESSAGES_PER_PAGE,
        });
        const fresh = (data.messages || []).map(pickMessage);
        append ? setMessages((p) => [...fresh, ...p]) : setMessages(fresh);
        setHasMore(fresh.length === MESSAGES_PER_PAGE);
        setPage(pageNum);
      } catch (e) {
        console.error("Load messages error:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    if (!conversationId) return;
    isInitialLoad.current = true;
    setMessages([]);
    setHasMore(true);
    setPage(1);
    loadMessages(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) sessionStorage.setItem("activeChatId", conversationId);
    return () => sessionStorage.removeItem("activeChatId");
  }, [conversationId]);

  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;
    if (isInitialLoad.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isInitialLoad.current = false;
    } else {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      scrollHeight - scrollTop - clientHeight < 100
        ? scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          })
        : setShowScrollButton(true);
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight >= 100);
    if (scrollTop < 50 && hasMore && !loadingMore) loadMessages(page + 1, true);
  }, [hasMore, loadingMore, page, loadMessages]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (scrollRef.current)
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    readRequestedRef.current = new Set();
  }, [conversationId]);

  // ✅ clear typing timer on unmount (was a leak before)
  useEffect(
    () => () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    },
    []
  );

  useEffect(() => {
    if (!socket || !conversationId || messages.length === 0) return;
    const pending = messages.filter((m) => {
      const r =
        typeof m.receiver === "string"
          ? m.receiver
          : m.receiver?._id?.toString?.();
      return (
        r === currentUserId &&
        !m.deletedForEveryone &&
        (!m.isRead || !m.isDelivered)
      );
    });
    pending.forEach((m) => {
      const id = typeof m._id === "string" ? m._id : m._id?.toString?.();
      if (readRequestedRef.current.has(id)) return;
      readRequestedRef.current.add(id);
      markMessageAsRead(id).catch(() => {}); // REST only; server broadcasts cumulative read
    });
    if (pending.length)
      window.dispatchEvent(new CustomEvent("chat:messages-read"));
  }, [messages, conversationId, currentUserId, socket]);

  useEffect(() => {
    if (!socket || !conversationId) return;
    socket.emit("join_conversation", conversationId);
    const sameId = (a, b) =>
      (typeof a === "string" ? a : a?._id?.toString?.()) ===
      (typeof b === "string" ? b : b?._id?.toString?.());
    const senderOf = (m) =>
      typeof m.sender === "string" ? m.sender : m.sender?._id?.toString?.();

    const onNew = (raw) => {
      const msg = pickMessage(raw);
      const cid =
        typeof msg.conversation === "string"
          ? msg.conversation
          : msg.conversation?._id?.toString?.();
      if (cid !== conversationId) return;
      setMessages((p) =>
        p.some((m) => sameId(m._id, msg._id)) ? p : [...p, msg]
      );
      const r =
        typeof msg.receiver === "string"
          ? msg.receiver
          : msg.receiver?._id?.toString?.();
      if (r === currentUserId) {
        const id =
          typeof msg._id === "string" ? msg._id : msg._id?.toString?.();
        if (!readRequestedRef.current.has(id)) {
          readRequestedRef.current.add(id);
          markMessageAsRead(id).catch(() => {});
        }
      }
    };
    const onDelivered = ({ messageId }) =>
      setMessages((p) =>
        p.map((m) =>
          sameId(m._id, messageId) ? { ...m, isDelivered: true } : m
        )
      );
    const onRead = ({ messageId }) =>
      setMessages((p) => {
        const t = p.find((m) => sameId(m._id, messageId));
        const cut = t ? new Date(t.createdAt).getTime() : null;
        return p.map((m) =>
          sameId(m._id, messageId)
            ? { ...m, isRead: true, isDelivered: true, readAt: new Date() }
            : cut !== null &&
              senderOf(m) === currentUserId &&
              new Date(m.createdAt).getTime() <= cut
            ? { ...m, isRead: true, isDelivered: true, readAt: new Date() }
            : m
        );
      });
    const onMessagesRead = ({ conversationId: cid, readUpTo, readerId }) => {
      if (cid && cid !== conversationId) return;
      if (readerId === currentUserId) return;
      const cut = new Date(readUpTo).getTime();
      setMessages((p) =>
        p.map((m) =>
          senderOf(m) === currentUserId &&
          new Date(m.createdAt).getTime() <= cut
            ? { ...m, isDelivered: true, isRead: true, readAt: readUpTo }
            : m
        )
      );
    };
    const onReacted = ({ messageId, reactions }) =>
      setMessages((p) =>
        p.map((m) =>
          sameId(m._id, messageId)
            ? {
                ...m,
                reactions: Array.isArray(reactions) ? reactions : m.reactions,
              }
            : m
        )
      );
    const onDeleted = ({ messageId }) =>
      setMessages((p) =>
        p.map((m) =>
          sameId(m._id, messageId) ? { ...m, deletedForEveryone: true } : m
        )
      );
    const onTyping = ({ userId, isTyping }) =>
      setTypingUsers((p) => {
        const n = new Set(p);
        isTyping ? n.add(userId) : n.delete(userId);
        return n;
      });

    socket.on("new_message", onNew);
    socket.on("message_delivered", onDelivered);
    socket.on("message_read", onRead);
    socket.on("messages_read", onMessagesRead);
    socket.on("message_reacted", onReacted);
    socket.on("message_deleted", onDeleted);
    socket.on("user_typing", onTyping);
    return () => {
      socket.emit("leave_conversation", conversationId);
      socket.off("new_message", onNew);
      socket.off("message_delivered", onDelivered);
      socket.off("message_read", onRead);
      socket.off("messages_read", onMessagesRead);
      socket.off("message_reacted", onReacted);
      socket.off("message_deleted", onDeleted);
      socket.off("user_typing", onTyping);
    };
  }, [socket, conversationId, currentUserId]);

  const handleSend = async ({
    type = "text",
    text = "",
    file = null,
    attachment = null,
  }) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    if (type === "text" && (!text || !text.trim())) {
      sendingRef.current = false;
      return;
    }
    if (text && text.length > MAX_TEXT) {
      toast.error(`Message too long (max ${MAX_TEXT} characters)`);
      sendingRef.current = false;
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    setMessages((p) => [
      ...p,
      {
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
      },
    ]);

    try {
      setSending(true);
      let att = attachment;
      if (file) {
        const up = await uploadChatAttachment(file, conversationId);
        att = up.attachment;
      } // server-trusted duration/url
      const response = await sendMessage(conversationId, {
        text,
        type,
        attachment: att,
      });
      const real = pickMessage(response.message);
      const rid = real._id;
      setMessages((p) => {
        const sock = p.find((m) => m._id === rid);
        const finalMsg = {
          ...real,
          sending: false,
          failed: false,
          isDelivered: real.isDelivered || sock?.isDelivered || false,
          deliveredAt: real.deliveredAt || sock?.deliveredAt || null,
          isRead: real.isRead || sock?.isRead || false,
          readAt: real.readAt || sock?.readAt || null,
        };
        return p
          .filter((m) => m._id !== tempId && m._id !== rid)
          .concat(finalMsg); // dedupe temp + socket twin
      });
    } catch (e) {
      console.error("Send error:", e);
      toast.error(e.message || "Failed to send message. Tap to retry.");
      setMessages((p) =>
        p.map((m) =>
          m._id === tempId ? { ...m, failed: true, sending: false } : m
        )
      );
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const handleRetry = async (failed) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setMessages((p) =>
      p.map((m) =>
        m._id === failed._id ? { ...m, failed: false, sending: true } : m
      )
    );
    try {
      const response = await sendMessage(conversationId, {
        text: failed.text,
        type: failed.type,
        attachment: failed.attachment,
      });
      const real = pickMessage(response.message);
      const rid = real._id;
      setMessages((p) => {
        const sock = p.find((m) => m._id === rid);
        const finalMsg = {
          ...real,
          sending: false,
          failed: false,
          isDelivered: real.isDelivered || sock?.isDelivered || false,
          deliveredAt: real.deliveredAt || sock?.deliveredAt || null,
          isRead: real.isRead || sock?.isRead || false,
          readAt: real.readAt || sock?.readAt || null,
        };
        return p
          .filter((m) => m._id !== failed._id && m._id !== rid)
          .concat(finalMsg);
      });
    } catch {
      toast.error("Retry failed. Please try again.");
      setMessages((p) =>
        p.map((m) =>
          m._id === failed._id ? { ...m, failed: true, sending: false } : m
        )
      );
    } finally {
      sendingRef.current = false;
    }
  };

  const handleReact = async (id, emoji) => {
    try {
      await reactToMessage(id, emoji);
    } catch {
      toast.error("Failed to add reaction");
    }
  };
  const handleDeleteMessage = async (id, scope) => {
    try {
      await deleteMessage(id, scope);
      if (scope === "me") setMessages((p) => p.filter((m) => m._id !== id));
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to delete message");
    }
  };
  const handleImageClick = (url) => {
    if (isSafeUrl(url)) setLightbox({ photos: [url], index: 0 });
  };
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
      setShowScrollButton(false);
    }
  };
  const handleTypingStart = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket?.emit("typing_start", { conversationId });
    typingTimeoutRef.current = setTimeout(
      () => socket?.emit("typing_stop", { conversationId }),
      2000
    );
  };

  const grouped = useMemo(() => {
    const g = [];
    let cur = null;
    messages
      .filter((m) => !m.deletedFor?.includes(currentUserId))
      .forEach((m) => {
        const d = new Date(m.createdAt).toDateString();
        if (d !== cur) {
          cur = d;
          g.push({ type: "date", date: d });
        }
        g.push({ type: "message", data: m });
      });
    return g;
  }, [messages, currentUserId]);

  const otherTyping = typingUsers.has(otherUser?._id?.toString());
  const otherPhoto = otherUser?.photos?.[0]?.url;
  const safeOtherPhoto = isSafeUrl(otherPhoto) ? avatarImg(otherPhoto) : null;

  return (
    <div className="chat-window">
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
            {safeOtherPhoto ? (
              <img
                src={safeOtherPhoto}
                alt={`${otherUser?.name || "user"}'s avatar`}
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
              {otherTyping
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
            {grouped.map((it, idx) =>
              it.type === "date" ? (
                <div key={`date-${idx}`} className="chat-date-separator">
                  <span>
                    {it.date === new Date().toDateString()
                      ? "Today"
                      : it.date ===
                        new Date(Date.now() - 86400000).toDateString()
                      ? "Yesterday"
                      : new Date(it.date).toLocaleDateString()}
                  </span>
                </div>
              ) : (
                <MessageBubble
                  key={it.data._id}
                  message={it.data}
                  isMine={
                    (typeof it.data.sender === "string"
                      ? it.data.sender
                      : it.data.sender?._id) === currentUserId
                  }
                  onReact={(e) => handleReact(it.data._id, e)}
                  onDelete={(s) => handleDeleteMessage(it.data._id, s)}
                  onImageClick={handleImageClick}
                  onRetry={() => handleRetry(it.data)}
                  sending={it.data.sending}
                  failed={it.data.failed}
                />
              )
            )}
            {otherTyping && (
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

      {showScrollButton && (
        <button
          className="chat-scroll-to-bottom"
          onClick={scrollToBottom}
          aria-label="Scroll to latest messages"
        >
          <i className="bi bi-chevron-down"></i>
        </button>
      )}
      <ChatInputBar
        onSend={handleSend}
        disabled={sending}
        onTyping={handleTypingStart}
      />
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
