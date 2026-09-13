import { useEffect, useState, useRef, memo, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getConversations,
  createOrGetConversation,
  deleteConversation, // 👈 Step 3: import
} from "../services/messageService.js";
import ChatWindow from "../components/ChatWindow.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx"; // 👈 Step 3: import
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext"; // 👈 Step 3: import
import { Virtuoso } from "react-virtuoso";
import Loader from "../components/Loader.jsx";
import { avatarImg } from "../utils/cloudinary";

/* ============ CONVERSATION ITEM (hover / swipe / hold delete) ============ */
const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}) {
  const otherUser = conversation.user;
  const lastMessage = conversation.lastMessage;

  const [revealed, setRevealed] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const touchStartX = useRef(0);
  const touchNowX = useRef(0);
  const longPressTimer = useRef(null);

  const closeReveal = () => {
    setRevealed(false);
    setOffsetX(0);
  };

  /* MOBILE: hold 1 second → reveal delete */
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchNowX.current = e.touches[0].clientX;
    longPressTimer.current = setTimeout(() => {
      setRevealed(true);
      setOffsetX(-72);
      navigator.vibrate?.(40);
    }, 1000);
  };

  /* MOBILE: slide right → left */
  const handleTouchMove = (e) => {
    touchNowX.current = e.touches[0].clientX;
    const delta = touchNowX.current - touchStartX.current;
    if (Math.abs(delta) > 8) clearTimeout(longPressTimer.current);
    if (delta < 0) setOffsetX(Math.max(delta, -72));
    else if (!revealed) setOffsetX(0);
  };

  const handleTouchEnd = () => {
    clearTimeout(longPressTimer.current);
    const delta = touchNowX.current - touchStartX.current;
    if (delta < -40) {
      setRevealed(true);
      setOffsetX(-72);
    } else {
      closeReveal();
    }
  };

  const handleRowClick = () => {
    if (revealed) {
      closeReveal(); // first tap closes the swipe
      return;
    }
    onSelect(conversation);
  };

  return (
    <div className={`conversation-item-shell ${revealed ? "revealed" : ""}`}>
      {/* 🗑 DELETE BUTTON */}
      <button
        type="button"
        className="conversation-delete"
        title="Delete conversation"
        onClick={(e) => {
          e.stopPropagation();
          closeReveal();
          onDelete(conversation);
        }}
      >
        <i className="bi bi-trash-fill"></i>
      </button>

      {/* ROW (slides on mobile) */}
      <div
        role="button"
        tabIndex={0}
        className={`conversation-item ${
          isActive ? "conversation-item-active" : ""
        }`}
        style={{ transform: `translateX(${offsetX}px)` }}
        onClick={handleRowClick}
        onKeyDown={(e) => e.key === "Enter" && handleRowClick()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="conversation-avatar">
          {otherUser?.photos?.[0]?.url ? (
            <img
              src={avatarImg(otherUser.photos[0].url)}
              alt={otherUser.name}
            />
          ) : (
            <span>{otherUser?.name?.charAt(0)?.toUpperCase() || "?"}</span>
          )}
        </div>
        <div className="conversation-content">
          <div className="conversation-top">
            <strong>{otherUser?.name}</strong>
            {conversation.lastMessageAt && (
              <time>
                {new Date(conversation.lastMessageAt).toLocaleDateString()}
              </time>
            )}
          </div>
          <p>
            {lastMessage?.deletedForEveryone
              ? "This message was deleted"
              : lastMessage?.type === "image"
              ? "📷 Photo"
              : lastMessage?.type === "voice"
              ? "🎤 Voice message"
              : lastMessage?.type === "sticker"
              ? `${lastMessage.text} Sticker`
              : lastMessage?.type === "heart"
              ? "❤️"
              : lastMessage?.type === "post"
              ? "📤 Shared post"
              : lastMessage?.text || "Start a conversation"}
          </p>
        </div>
      </div>
    </div>
  );
});

/* ============ MESSAGES PAGE ============ */
function Messages() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const toast = useAlert(); // 👈 Step 3
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const matchIdFromUrl = searchParams.get("matchId");

  const [conversations, setConversations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [conversationToDelete, setConversationToDelete] = useState(null); // 👈 Step 3

  const openingRef = useRef(false);
  const conversationsRef = useRef([]);

  /* SEARCH: matched users */
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return matches.filter((m) =>
      (m?.user?.name || "").toLowerCase().includes(q)
    );
  }, [matches, search]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getConversations();
      const sorted = (data.conversations || []).sort(
        (a, b) =>
          new Date(b.lastMessageAt || b.createdAt || 0) -
          new Date(a.lastMessageAt || a.createdAt || 0)
      );
      setConversations(sorted);
    } catch (err) {
      console.error("Load conversations error:", err);
      setError(err.response?.data?.message || "Unable to load conversations.");
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      const token =
        localStorage.getItem("accessToken") || localStorage.getItem("token");
      const baseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:5000/api";

      const res = await fetch(`${baseUrl}/matches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      const list = Array.isArray(data)
        ? data
        : data?.matches || data?.data?.matches || [];

      setMatches(list);
    } catch (err) {
      console.error("Load matches error:", err);
    }
  };

  useEffect(() => {
    loadConversations();
    loadMatches();
  }, []);

  const moveConversationToTop = (conversationId, message) => {
    if (!conversationId) return;

    const exists = conversationsRef.current.some(
      (c) => c._id === conversationId
    );

    if (!exists) {
      loadConversations();
      return;
    }

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c._id === conversationId);
      if (idx === -1) return prev;

      const updated = [...prev];
      const [conv] = updated.splice(idx, 1);

      updated.unshift({
        ...conv,
        lastMessage: message || conv.lastMessage,
        lastMessageAt:
          message?.createdAt || conv.lastMessageAt || new Date().toISOString(),
      });

      return updated;
    });
  };

  /* Open (or create) chat from search result */
  const handleOpenMatch = async (match) => {
    try {
      setLoading(true);
      const data = await createOrGetConversation(match._id);

      if (data.success && data.conversation) {
        const otherUser = data.conversation.participants.find(
          (p) => p._id.toString() !== user._id.toString()
        );

        setSelectedConversation({
          _id: data.conversation._id,
          user: otherUser,
          lastMessage: data.conversation.lastMessage,
          lastMessageAt: data.conversation.lastMessageAt,
        });

        setSearch("");
        await loadConversations();
      }
    } catch (err) {
      console.error("Open match chat error:", err);
      setError(err.response?.data?.message || "Failed to open conversation.");
    } finally {
      setLoading(false);
    }
  };

  /* AUTO-OPEN FROM ?matchId= URL */
  useEffect(() => {
    const autoOpenChat = async () => {
      if (!matchIdFromUrl || !user) return;
      if (openingRef.current) return;
      openingRef.current = true;

      try {
        setLoading(true);
        const data = await createOrGetConversation(matchIdFromUrl);

        if (data.success && data.conversation) {
          const otherUser = data.conversation.participants.find(
            (p) => p._id.toString() !== user._id.toString()
          );

          setSelectedConversation({
            _id: data.conversation._id,
            user: otherUser,
            lastMessage: data.conversation.lastMessage,
            lastMessageAt: data.conversation.lastMessageAt,
          });

          await loadConversations();
          navigate("/messages", { replace: true });
        }
      } catch (err) {
        const backendError = err.response?.data;
        console.error("❌ BACKEND ERROR:", backendError || err.message);
        setError(backendError?.message || "Failed to open conversation.");
      } finally {
        setLoading(false);
        openingRef.current = false;
      }
    };

    autoOpenChat();
  }, [matchIdFromUrl, user, navigate]);

  /* SOCKET: reorder + real-time delete */
  useEffect(() => {
    if (!socket) return;

    const handleConversationUpdated = ({ conversationId, message }) => {
      moveConversationToTop(conversationId, message);
    };

    const handleNewMessage = (msg) => {
      const convId =
        typeof msg.conversation === "string"
          ? msg.conversation
          : msg.conversation?._id;
      moveConversationToTop(convId, msg);
    };

    // 👇 Step 3: real-time delete for BOTH users
    const handleConversationDeleted = ({ conversationId }) => {
      setConversations((prev) => prev.filter((c) => c._id !== conversationId));
      setSelectedConversation((prev) =>
        prev?._id === conversationId ? null : prev
      );
    };

    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("new_message", handleNewMessage);
    socket.on("conversation_deleted", handleConversationDeleted);

    return () => {
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("new_message", handleNewMessage);
      socket.off("conversation_deleted", handleConversationDeleted);
    };
  }, [socket]);

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
    setSearch("");
  };

  /* 👇 Step 3: delete handlers */
  const requestDeleteConversation = (conversation) => {
    setConversationToDelete(conversation);
  };

  const confirmDeleteConversation = async () => {
    const target = conversationToDelete;
    setConversationToDelete(null);
    if (!target) return;

    try {
      await deleteConversation(target._id);
      setConversations((prev) => prev.filter((c) => c._id !== target._id));
      if (selectedConversation?._id === target._id) {
        setSelectedConversation(null);
      }
      toast.success("Conversation deleted 🗑️");
    } catch (err) {
      console.error("Delete conversation error:", err);
      toast.error(
        err.response?.data?.message || "Failed to delete conversation"
      );
    }
  };

  if (loading) {
    return (
      <main className="messages-page">
        <div className="messages-container">
          <Loader
            full
            text="Loading your conversations"
            icon="chat-dots-fill"
          />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="messages-page">
        <div className="messages-container">
          <div className="messages-error">
            <h2>Messages</h2>
            <p style={{ color: "#dc2626", fontWeight: "bold" }}>{error}</p>
            <button type="button" onClick={loadConversations}>
              Try Again
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="messages-page">
      <div className="messages-container">
        <aside
          className={`conversation-sidebar ${
            selectedConversation ? "conversation-sidebar-hidden-mobile" : ""
          }`}
        >
          <div className="conversation-header">
            <h1>Messages</h1>
            <span>{conversations.length}</span>
          </div>

          {/* Search bar */}
          <div className="conversation-search">
            <i className="bi bi-search"></i>
            <input
              type="text"
              placeholder="Search matches..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <i className="bi bi-x-circle-fill"></i>
              </button>
            )}
          </div>

          {/* SEARCH MODE */}
          {search.trim() ? (
            <div className="conversation-list">
              {searchResults.length === 0 ? (
                <div className="no-conversations">
                  <div>🔍</div>
                  <h3>No matches found</h3>
                  <p>No matched user named "{search.trim()}".</p>
                </div>
              ) : (
                searchResults.map((match) => (
                  <button
                    key={match._id}
                    className="conversation-item"
                    onClick={() => handleOpenMatch(match)}
                  >
                    <div className="conversation-avatar">
                      {match.user?.photos?.[0]?.url ? (
                        <img
                          src={avatarImg(match.user.photos[0].url)}
                          alt={match.user.name}
                        />
                      ) : (
                        <span>
                          {match.user?.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div className="conversation-content">
                      <div className="conversation-top">
                        <strong>{match.user?.name}</strong>
                      </div>
                      <p>
                        💕 Matched{" "}
                        {new Date(match.matchedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : conversations.length === 0 ? (
            <div className="no-conversations">
              <div>💬</div>
              <h3>No conversations yet</h3>
              <p>Match with someone and start chatting.</p>
            </div>
          ) : conversations.length > 20 ? (
            <div style={{ height: "calc(100% - 120px)", overflow: "hidden" }}>
              <Virtuoso
                style={{ height: "100%" }}
                data={conversations}
                overscan={300}
                computeItemKey={(index, conv) => conv._id}
                itemContent={(index, conversation) => (
                  <div style={{ padding: "0 8px 4px 8px" }}>
                    <ConversationItem
                      conversation={conversation}
                      isActive={selectedConversation?._id === conversation._id}
                      onSelect={handleSelectConversation}
                      onDelete={requestDeleteConversation} // 👈 Step 3
                    />
                  </div>
                )}
              />
            </div>
          ) : (
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                  isActive={selectedConversation?._id === conversation._id}
                  onSelect={handleSelectConversation}
                  onDelete={requestDeleteConversation} // 👈 Step 3
                />
              ))}
            </div>
          )}
        </aside>

        <div
          className={`messages-chat-area ${
            !selectedConversation ? "messages-chat-empty-mobile" : ""
          }`}
        >
          {selectedConversation ? (
            <ChatWindow
              conversationId={selectedConversation._id}
              currentUserId={user?._id}
              otherUser={selectedConversation.user}
              onBack={() => setSelectedConversation(null)}
            />
          ) : (
            <div className="select-chat">
              <div className="select-chat-icon">💕</div>
              <h2>Your conversations</h2>
              <p>Select a conversation to start chatting.</p>
            </div>
          )}
        </div>
      </div>

      {/* 👇 Step 3: delete confirmation dialog */}
      <ConfirmDialog
        open={conversationToDelete !== null}
        title="Delete this conversation?"
        message="All messages will be permanently deleted for BOTH users. This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
        icon="bi-trash-fill"
        onCancel={() => setConversationToDelete(null)}
        onConfirm={confirmDeleteConversation}
      />
    </main>
  );
}

export default Messages;
