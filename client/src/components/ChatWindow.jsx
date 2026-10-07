import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import ChatInputBar from "./ChatInputBar.jsx";
import MessageBubble from "./MessageBubble.jsx";
import PhotoLightbox from "./PhotoLightbox.jsx";
import { avatarImg } from "../utils/cloudinary";
import { useAlert } from "../context/AlertContext";
import { useNavigate } from "react-router-dom";
import { getBlockStatus, toggleBlockUser } from "../services/userService.js";
import { useCallContext } from "../context/CallContext.jsx"; // ✅ real call engine
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
const BOTTOM_THRESHOLD = 120;

// Defence-in-depth: never render javascript:/data:/non-allow-listed hosts.
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

// ✅ Call-message detection + normalization (server may name fields several ways).
// NOTE: bare "voice"/"audio" are NOT call types (voice = a recorded voice message),
// so we never misclassify a voice note as a call row.
const CALL_TYPES = new Set(["call", "audio_call", "video_call", "voice_call"]);
const CONNECTED_STATUSES = new Set([
  "ended",
  "completed",
  "answered",
  "connected",
]);
const CALL_LABEL = {
  missed: "Missed call",
  declined: "Declined",
  canceled: "Canceled",
  cancelled: "Canceled",
  failed: "Call failed",
  busy: "Busy",
  unreachable: "Unreachable",
  offline: "Offline",
  no_answer: "No answer",
  "no-answer": "No answer",
  ended: "Call ended",
  completed: "Call ended",
  answered: "Call ended",
  connected: "Call ended",
};

// Same clock format the bubble/header already use -> guaranteed visual parity.
const fmtCallTime = (v) => {
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};
// mm:ss (or h:mm:ss past an hour); 0/invalid -> "".
const fmtCallDuration = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "";
  const total = Math.floor(n / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
};

// Whitelist message fields coming from socket/HTTP.
const pickMessage = (m) => {
  if (!m || typeof m !== "object") return m;

  const rawType = typeof m.type === "string" ? m.type.toLowerCase() : "";
  const isCall =
    CALL_TYPES.has(rawType) ||
    m.callStatus != null ||
    (m.callType != null && m.callType !== "");

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
    // ✅ preserved so call rows can render date/time/duration like messages
    isCall,
  };

  if (isCall) {
    const ct =
      (typeof m.callType === "string" && m.callType) ||
      (typeof m.mediaType === "string" && m.mediaType) ||
      (rawType.includes("video") ? "video" : "audio");
    out.callType = ct === "video" ? "video" : "audio";

    const st =
      (typeof m.callStatus === "string" && m.callStatus) ||
      (typeof m.status === "string" && m.status) ||
      (m.missed ? "missed" : m.declined ? "declined" : "ended");
    out.callStatus = String(st).slice(0, 40).toLowerCase();

    const dnum = Number(
      m.durationMs ?? m.callDuration ?? m.duration ?? m.lengthMs ?? 0
    );
    out.durationMs =
      Number.isFinite(dnum) && dnum > 0
        ? Math.min(dnum, 24 * 60 * 60 * 1000) // clamp absurd values
        : 0;

    out.startedAt = m.startedAt || m.createdAt || null;
    out.endedAt = m.endedAt || null;
  }

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

// Centered call-log row (rendered by ChatWindow so it never depends on
// MessageBubble internals). All text flows through JSX => escaped; icon/label
// come from fixed maps keyed by a normalized status => no socket-string markup.
function CallRow({ message }) {
  const isVideo = message.callType === "video";
  const status = message.callStatus || "ended";
  const connected = CONNECTED_STATUSES.has(status);
  const dur = connected ? fmtCallDuration(message.durationMs) : "";
  const label = CALL_LABEL[status] || (isVideo ? "Video call" : "Voice call");
  const time = fmtCallTime(message.startedAt || message.createdAt);

  const aria = [label, dur ? `duration ${dur}` : "", time]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className="chat-call-row"
      aria-label={aria}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        margin: "6px auto",
        padding: "6px 12px",
        maxWidth: 320,
        fontSize: 12,
        color: "#6b7280",
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 13,
          flex: "0 0 auto",
          background: isVideo ? "#6366f1" : "#22c55e",
        }}
      >
        <i
          className={`bi ${isVideo ? "bi-videocam-fill" : "bi-telephone-fill"}`}
        />
      </span>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          minWidth: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: "#374151", lineHeight: 1.2 }}>
          {label}
        </span>
        {dur ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#6b7280",
            }}
          >
            <i className="bi bi-clock" aria-hidden="true" /> {dur}
          </span>
        ) : null}
        {time ? (
          <span style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.2 }}>
            {time}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function ChatWindow({ conversationId, currentUserId, otherUser, onBack }) {
  const { socket } = useSocket();
  const toast = useAlert();
  const navigate = useNavigate();
  const call = useCallContext();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());

  // ✅ block state for the chat header (call gating + hamburger label)
  const [blockStatus, setBlockStatus] = useState({
    iBlocked: false,
    blockedMe: false,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);

  const scrollRef = useRef(null);
  const innerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const prevTailRef = useRef({ id: null, len: 0 });
  const readRequestedRef = useRef(new Set());
  const typingTimeoutRef = useRef(null);
  const sendingRef = useRef(false);

  const snapToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

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
    isAtBottomRef.current = true;
    prevTailRef.current = { id: null, len: 0 };
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

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    const last = messages[messages.length - 1];
    const tailId = last
      ? typeof last._id === "string"
        ? last._id
        : last._id?.toString?.()
      : null;
    const prev = prevTailRef.current;
    const grew = messages.length > prev.len;
    const tailChanged = tailId !== prev.id;

    if (grew && tailChanged) {
      if (isAtBottomRef.current) {
        el.scrollTop = el.scrollHeight;
        setShowScrollButton(false);
      } else {
        setShowScrollButton(true);
      }
    }
    prevTailRef.current = { id: tailId, len: messages.length };
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atBottom = scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD;
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
    if (scrollTop < 50 && hasMore && !loadingMore) loadMessages(page + 1, true);
  }, [hasMore, loadingMore, page, loadMessages]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (isAtBottomRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [conversationId, loading]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (isAtBottomRef.current) snapToBottom();
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [snapToBottom]);

  useEffect(() => {
    readRequestedRef.current = new Set();
  }, [conversationId]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    },
    []
  );

  // ✅ block status fetch (cancelled-flag pattern)
  useEffect(() => {
    let cancelled = false;
    if (!otherUser?._id) {
      setBlockStatus({ iBlocked: false, blockedMe: false });
      return;
    }
    getBlockStatus(otherUser._id)
      .then((res) => {
        if (cancelled) return;
        const bs = res?.data ?? res;
        setBlockStatus({
          iBlocked: !!bs?.iBlocked,
          blockedMe: !!bs?.blockedMe,
        });
      })
      .catch(() => {
        if (!cancelled) setBlockStatus({ iBlocked: false, blockedMe: false });
      });
    return () => {
      cancelled = true;
    };
  }, [otherUser?._id]);

  // ✅ outside-click + Escape for the hamburger
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(e.target)
      )
        setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ✅ close menu when switching conversation
  useEffect(() => {
    setMenuOpen(false);
  }, [conversationId]);

  const isCallBlocked = blockStatus.iBlocked || blockStatus.blockedMe;
  const callPhase = call?.phase || "idle";
  const canCall = !isCallBlocked && callPhase === "idle" && !!call;

  // ✅ real call start (server re-validates match/block/rate)
  const startCall = (mediaType) => {
    if (!canCall || !otherUser?._id) return;
    call.startCall(otherUser._id, mediaType, conversationId);
  };

  const handleToggleBlock = async () => {
    if (!otherUser?._id) return;
    try {
      const res = await toggleBlockUser(otherUser._id);
      const blocked = res?.blocked ?? res?.data?.blocked;
      setBlockStatus((p) => ({ ...p, iBlocked: !!blocked }));
      setMenuOpen(false);

      if (blocked) {
        // ✅ If currently in a call with this peer, end it client-side too.
        // Server-side authoritative teardown happens in user.controller.toggleBlock.
        if (
          call &&
          callPhase !== "idle" &&
          String(call.peer?._id) === String(otherUser._id)
        ) {
          call.endCall("blocked");
        }
        toast.warning(`${otherUser.name} blocked 🚫`, "Blocked", 3000);
      } else {
        toast.success(`${otherUser.name} unblocked`, "Unblocked", 3000);
      }
    } catch (e) {
      toast.error(
        e.response?.data?.message || "Failed to update block",
        "Error",
        4000
      );
    }
  };

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
        !m.isCall && // ✅ call logs are not read-receipted (avoids bogus writes)
        (!m.isRead || !m.isDelivered)
      );
    });
    pending.forEach((m) => {
      const id = typeof m._id === "string" ? m._id : m._id?.toString?.();
      if (readRequestedRef.current.has(id)) return;
      readRequestedRef.current.add(id);
      markMessageAsRead(id).catch(() => {});
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
      if (r === currentUserId && !msg.isCall) {
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
        isCall: false,
      },
    ]);

    try {
      setSending(true);
      let att = attachment;
      if (file) {
        const up = await uploadChatAttachment(file, conversationId);
        att = up.attachment;
      }
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
          .concat(finalMsg);
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
      isAtBottomRef.current = true;
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

        <div
          className="chat-header-actions"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <button
            type="button"
            className="chat-header-icon-btn"
            onClick={() => startCall("video")}
            disabled={!canCall}
            title={
              isCallBlocked
                ? "Calling blocked"
                : callPhase !== "idle"
                ? "Already in a call"
                : "Video call"
            }
            aria-label={
              isCallBlocked
                ? "Video call unavailable (blocked)"
                : "Start video call"
            }
            style={{ opacity: canCall ? 1 : 0.4 }}
          >
            <i className="bi bi-camera-video" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            className="chat-header-icon-btn"
            onClick={() => startCall("audio")}
            disabled={!canCall}
            title={
              isCallBlocked
                ? "Calling blocked"
                : callPhase !== "idle"
                ? "Already in a call"
                : "Voice call"
            }
            aria-label={
              isCallBlocked
                ? "Voice call unavailable (blocked)"
                : "Start voice call"
            }
            style={{ opacity: canCall ? 1 : 0.4 }}
          >
            <i className="bi bi-telephone" aria-hidden="true"></i>
          </button>

          <div
            className="chat-header-menu"
            ref={menuRef}
            style={{ position: "relative" }}
          >
            <button
              type="button"
              ref={menuBtnRef}
              className="chat-header-icon-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              aria-label="Conversation options"
              title="More options"
            >
              <i className="bi bi-three-dots-vertical" aria-hidden="true"></i>
            </button>
            {menuOpen && (
              <div
                className="chat-header-dropdown"
                role="menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  zIndex: 30,
                  minWidth: 180,
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 8px 30px rgba(0,0,0,.12)",
                  padding: 6,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="chat-header-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/users/${otherUser?._id}`);
                  }}
                >
                  <i className="bi bi-person" aria-hidden="true"></i> View
                  profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="chat-header-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/users/${otherUser?._id}?report=1`);
                  }}
                >
                  <i className="bi bi-flag" aria-hidden="true"></i> Report
                </button>
                <div
                  style={{ height: 1, background: "#eee", margin: "4px 0" }}
                />
                <button
                  type="button"
                  role="menuitem"
                  className="chat-header-menu-item"
                  style={{
                    color: blockStatus.iBlocked ? "#16a34a" : "#dc2626",
                  }}
                  onClick={handleToggleBlock}
                >
                  <i
                    className={`bi ${
                      blockStatus.iBlocked ? "bi-unlock" : "bi-slash-circle"
                    }`}
                    aria-hidden="true"
                  ></i>
                  {blockStatus.iBlocked ? "Unblock" : "Block"}
                </button>
              </div>
            )}
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
          <div
            ref={innerRef}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              width: "100%",
              minWidth: 0,
            }}
          >
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
              ) : it.data.isCall ? (
                // ✅ call log row: same date (separator) + same time format as a
                //    bubble, plus the call duration. Rendered here so it does not
                //    depend on MessageBubble's internal call handling.
                <CallRow key={it.data._id} message={it.data} />
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
          </div>
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
