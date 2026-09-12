import { useEffect, useState, useRef, memo } from "react"; // 👈 ADD memo
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getConversations,
  createOrGetConversation,
} from "../services/messageService.js";
import ChatWindow from "../components/ChatWindow.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Virtuoso } from "react-virtuoso";
import Loader from "../components/Loader.jsx"; // 👈 ADD

// 👇 EXTRACTED: Memoized conversation item (prevents re-rendering all items when one updates)
const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
}) {
  const otherUser = conversation.user;
  const lastMessage = conversation.lastMessage;

  return (
    <button
      className={`conversation-item ${
        isActive ? "conversation-item-active" : ""
      }`}
      onClick={() => onSelect(conversation)}
    >
      <div className="conversation-avatar">
        {otherUser?.photos?.[0]?.url ? (
          <img src={otherUser.photos[0].url} alt={otherUser.name} />
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
    </button>
  );
});

function Messages() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const matchIdFromUrl = searchParams.get("matchId");

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const openingRef = useRef(false);
  const conversationsRef = useRef([]);

  // Keep ref in sync so socket handlers can read latest list safely
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // LOAD CONVERSATIONS (sorted newest first)
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

  useEffect(() => {
    loadConversations();
  }, []);

  // MOVE CONVERSATION TO TOP (no side effects inside setState)
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

  // AUTO-OPEN CHAT FROM ?matchId= URL
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

  // REAL-TIME: reorder on ANY new activity
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

    socket.on("conversation_updated", handleConversationUpdated);
    socket.on("new_message", handleNewMessage);

    return () => {
      socket.off("conversation_updated", handleConversationUpdated);
      socket.off("new_message", handleNewMessage);
    };
  }, [socket]);

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
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

          {conversations.length === 0 ? (
            <div className="no-conversations">
              <div>💬</div>
              <h3>No conversations yet</h3>
              <p>Match with someone and start chatting.</p>
            </div>
          ) : conversations.length > 20 ? (
            // 👇 VIRTUALIZED LIST for 20+ conversations (smooth scrolling)
            <div style={{ height: "calc(100% - 70px)", overflow: "hidden" }}>
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
                    />
                  </div>
                )}
              />
            </div>
          ) : (
            // 👇 NORMAL RENDER for small lists (fewer than 20)
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <ConversationItem
                  key={conversation._id}
                  conversation={conversation}
                  isActive={selectedConversation?._id === conversation._id}
                  onSelect={handleSelectConversation}
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
    </main>
  );
}

export default Messages;
