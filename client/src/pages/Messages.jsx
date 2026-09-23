import { useEffect, useState, useRef, memo, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getConversations,
  createOrGetConversation,
  deleteConversation,
} from "../services/messageService.js";
import { getMatches } from "../services/matchService.js";
import ChatWindow from "../components/ChatWindow.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext";
import { Virtuoso } from "react-virtuoso";
import Loader from "../components/Loader.jsx";
import SEO from "../components/SEO";
import { avatarImg } from "../utils/cloudinary";

/* ═══════════════════════════════════════════════════════
   CONVERSATION ITEM (memoized — hover / swipe / hold delete)
   ═══════════════════════════════════════════════════════ */
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

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchNowX.current = e.touches[0].clientX;
    longPressTimer.current = setTimeout(() => {
      setRevealed(true);
      setOffsetX(-72);
      navigator.vibrate?.(40);
    }, 1000);
  };

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
      closeReveal();
      return;
    }
    onSelect(conversation);
  };

  // ✅ Format last message preview
  const getMessagePreview = () => {
    if (!lastMessage) return "Start a conversation";
    if (lastMessage.deletedForEveryone) return "This message was deleted";
    switch (lastMessage.type) {
      case "image":
        return "📷 Photo";
      case "voice":
        return "🎤 Voice message";
      case "sticker":
        return `${lastMessage.text} Sticker`;
      case "heart":
        return "❤️";
      case "post":
        return "📤 Shared post";
      case "gif":
        return "🎬 GIF";
      default:
        return lastMessage.text || "Start a conversation";
    }
  };

  return (
    <div className={`conversation-item-shell ${revealed ? "revealed" : ""}`}>
      {/* Delete Button */}
      <button
        type="button"
        className="conversation-delete"
        aria-label={`Delete conversation with ${otherUser?.name || "user"}`}
        onClick={(e) => {
          e.stopPropagation();
          closeReveal();
          onDelete(conversation);
        }}
      >
        <i className="bi bi-trash-fill" aria-hidden="true"></i>
      </button>

      {/* Row (slides on mobile) */}
      <div
        role="button"
        tabIndex={0}
        className={`conversation-item ${
          isActive ? "conversation-item-active" : ""
        }`}
        style={{ transform: `translateX(${offsetX}px)` }}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick();
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-label={`Chat with ${
          otherUser?.name || "user"
        }. ${getMessagePreview()}`}
        aria-current={isActive ? "true" : undefined}
      >
        <div className="conversation-avatar">
          {otherUser?.photos?.[0]?.url ? (
            <img
              src={avatarImg(otherUser.photos[0].url)}
              alt=""
              loading="lazy"
            />
          ) : (
            <span aria-hidden="true">
              {otherUser?.name?.charAt(0)?.toUpperCase() || "?"}
            </span>
          )}
        </div>

        <div className="conversation-content">
          <div className="conversation-top">
            <strong>{otherUser?.name}</strong>
            {conversation.lastMessageAt && (
              <time dateTime={conversation.lastMessageAt}>
                {new Date(conversation.lastMessageAt).toLocaleDateString()}
              </time>
            )}
          </div>
          <p>{getMessagePreview()}</p>
        </div>

        <span className="conversation-swipe-hint" aria-hidden="true">
          <i className="bi bi-arrow-left-short"></i>
          <em>slide</em>
        </span>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   MESSAGES PAGE
   ═══════════════════════════════════════════════════════ */
function Messages() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const toast = useAlert();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const matchIdFromUrl = searchParams.get("matchId");

  const [conversations, setConversations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [conversationToDelete, setConversationToDelete] = useState(null);

  const openingRef = useRef(false);
  const conversationsRef = useRef([]);

  // ✅ Keep ref in sync for socket handlers
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // ✅ Search results (memoized)
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return matches.filter((m) =>
      (m?.user?.name || "").toLowerCase().includes(q)
    );
  }, [matches, search]);

  // ✅ Stable load functions
  const loadConversations = useCallback(async () => {
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
      setError(err.response?.data?.message || "Unable to load conversations.");
      toast.error("Failed to load conversations", "Error", 4000);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ✅ Use service layer instead of raw fetch
  const loadMatches = useCallback(async () => {
    try {
      const data = await getMatches();
      setMatches(data.matches || []);
    } catch (err) {
      console.error("Load matches error:", err);
    }
  }, []);

  // ✅ Correct dependency arrays
  useEffect(() => {
    loadConversations();
    loadMatches();
  }, [loadConversations, loadMatches]);

  // ✅ Stable reorder function using ref (no stale closure)
  const moveConversationToTop = useCallback(
    (conversationId, message) => {
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
            message?.createdAt ||
            conv.lastMessageAt ||
            new Date().toISOString(),
        });

        return updated;
      });
    },
    [loadConversations]
  );

  // ✅ Open (or create) chat from search result
  const handleOpenMatch = useCallback(
    async (match) => {
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
        setError(err.response?.data?.message || "Failed to open conversation.");
        toast.error("Failed to open conversation", "Error", 4000);
      } finally {
        setLoading(false);
      }
    },
    [user, loadConversations, toast]
  );

  // ✅ Auto-open from ?matchId= URL param
  useEffect(() => {
    if (!matchIdFromUrl || !user || openingRef.current) return;
    openingRef.current = true;

    (async () => {
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
        setError(err.response?.data?.message || "Failed to open conversation.");
      } finally {
        setLoading(false);
        openingRef.current = false;
      }
    })();
  }, [matchIdFromUrl, user, navigate, loadConversations]);

  // ✅ Socket listeners — stable via useCallback + refs
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
  }, [socket, moveConversationToTop]);

  const handleSelectConversation = useCallback((conversation) => {
    setSelectedConversation(conversation);
    setSearch("");
  }, []);

  const requestDeleteConversation = useCallback((conversation) => {
    setConversationToDelete(conversation);
  }, []);

  const confirmDeleteConversation = useCallback(async () => {
    const target = conversationToDelete;
    setConversationToDelete(null);
    if (!target) return;

    try {
      await deleteConversation(target._id);
      setConversations((prev) => prev.filter((c) => c._id !== target._id));
      if (selectedConversation?._id === target._id) {
        setSelectedConversation(null);
      }
      toast.success("Conversation deleted 🗑️", "Deleted", 3000);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to delete conversation",
        "Error",
        4000
      );
    }
  }, [conversationToDelete, selectedConversation, toast]);

  // ═══════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════
  if (loading && conversations.length === 0) {
    return (
      <>
        <SEO title="Messages" path="/messages" noIndex />
        <main className="messages-page" id="main-content">
          <div className="messages-container">
            <Loader
              full
              text="Loading your conversations"
              icon="chat-dots-fill"
            />
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════
  if (error && conversations.length === 0) {
    return (
      <>
        <SEO title="Messages" path="/messages" noIndex />
        <main className="messages-page" id="main-content">
          <div className="messages-container">
            <div className="messages-error" role="alert">
              <i
                className="bi bi-exclamation-triangle-fill fs-1 text-danger mb-3"
                aria-hidden="true"
              ></i>
              <h2>Messages</h2>
              <p className="text-danger fw-bold">{error}</p>
              <button
                type="button"
                className="btn btn-primary mt-2"
                onClick={loadConversations}
              >
                <i
                  className="bi bi-arrow-clockwise me-2"
                  aria-hidden="true"
                ></i>
                Try Again
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // MAIN VIEW
  // ═══════════════════════════════════════
  return (
    <>
      <SEO
        title={`Messages (${conversations.length}) — Maya Milan`}
        path="/messages"
        noIndex
      />

      <main className="messages-page" id="main-content">
        <div className="messages-container">
          {/* SIDEBAR */}
          <aside
            className={`conversation-sidebar ${
              selectedConversation ? "conversation-sidebar-hidden-mobile" : ""
            }`}
            aria-label="Conversations list"
          >
            <div className="conversation-header">
              <h1>Messages</h1>
              <span aria-live="polite">{conversations.length}</span>
            </div>

            {/* Search */}
            <div className="conversation-search">
              <label
                htmlFor="conversation-search-input"
                className="visually-hidden"
              >
                Search matches
              </label>
              <i className="bi bi-search" aria-hidden="true"></i>
              <input
                id="conversation-search-input"
                type="search"
                placeholder="Search matches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search matches by name"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <i className="bi bi-x-circle-fill" aria-hidden="true"></i>
                </button>
              )}
            </div>

            {/* SEARCH MODE */}
            {search.trim() ? (
              <div
                className="conversation-list"
                role="listbox"
                aria-label="Search results"
              >
                {searchResults.length === 0 ? (
                  <div className="no-conversations" role="status">
                    <div aria-hidden="true">🔍</div>
                    <h3>No matches found</h3>
                    <p>No matched user named "{search.trim()}".</p>
                  </div>
                ) : (
                  searchResults.map((match) => (
                    <button
                      key={match._id}
                      className="conversation-item"
                      onClick={() => handleOpenMatch(match)}
                      role="option"
                      aria-label={`Start chat with ${match.user?.name}`}
                    >
                      <div className="conversation-avatar">
                        {match.user?.photos?.[0]?.url ? (
                          <img
                            src={avatarImg(match.user.photos[0].url)}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span aria-hidden="true">
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
                          <time dateTime={match.matchedAt}>
                            {new Date(match.matchedAt).toLocaleDateString()}
                          </time>
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : conversations.length === 0 ? (
              <div className="no-conversations" role="status">
                <div aria-hidden="true">💬</div>
                <h3>No conversations yet</h3>
                <p>Match with someone and start chatting.</p>
              </div>
            ) : conversations.length > 20 ? (
              <div className="conversation-virtuoso-wrapper">
                <Virtuoso
                  style={{ height: "100%" }}
                  data={conversations}
                  overscan={300}
                  computeItemKey={(_, conv) => conv._id}
                  itemContent={(_, conversation) => (
                    <div className="conversation-virtuoso-item">
                      <ConversationItem
                        conversation={conversation}
                        isActive={
                          selectedConversation?._id === conversation._id
                        }
                        onSelect={handleSelectConversation}
                        onDelete={requestDeleteConversation}
                      />
                    </div>
                  )}
                />
              </div>
            ) : (
              <div
                className="conversation-list"
                role="list"
                aria-label="Conversations"
              >
                {conversations.map((conversation) => (
                  <ConversationItem
                    key={conversation._id}
                    conversation={conversation}
                    isActive={selectedConversation?._id === conversation._id}
                    onSelect={handleSelectConversation}
                    onDelete={requestDeleteConversation}
                  />
                ))}
              </div>
            )}
          </aside>

          {/* CHAT AREA */}
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
              <div className="select-chat" role="status">
                <div className="select-chat-icon" aria-hidden="true">
                  💕
                </div>
                <h2>Your conversations</h2>
                <p>Select a conversation to start chatting.</p>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation */}
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
    </>
  );
}

export default Messages;
