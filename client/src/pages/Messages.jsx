import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getConversations,
  createOrGetConversation,
} from "../services/messageService.js";
import ChatWindow from "../components/ChatWindow.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../context/AuthContext.jsx";

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

  /*
   * ==========================================
   * LOAD CONVERSATIONS
   * ==========================================
   */
  const loadConversations = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getConversations();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Load conversations error:", error);
      setError(
        error.response?.data?.message || "Unable to load conversations."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  /*
   * ==========================================
   * AUTO-OPEN CONVERSATION FROM matchId URL
   * ==========================================
   */
  useEffect(() => {
    const autoOpenChat = async () => {
      if (!matchIdFromUrl || !user) return;

      console.log("🔵 Auto-opening chat for matchId:", matchIdFromUrl);

      try {
        setLoading(true);

        // 1. Create or get the conversation from the match
        const data = await createOrGetConversation(matchIdFromUrl);

        console.log("✅ Conversation created/fetched:", data);

        if (data.success && data.conversation) {
          // 2. Find the other user in the conversation
          const otherUser = data.conversation.participants.find(
            (p) => p._id.toString() !== user._id.toString()
          );

          // 3. Set as selected conversation
          const conversationToSelect = {
            _id: data.conversation._id,
            user: otherUser,
            lastMessage: data.conversation.lastMessage,
            lastMessageAt: data.conversation.lastMessageAt,
          };

          setSelectedConversation(conversationToSelect);

          // 4. Reload conversations list to include the new one
          await loadConversations();

          // 5. Clean URL so it doesn't re-trigger
          navigate("/messages", { replace: true });
        }
      } catch (error) {
        console.error(" Auto-open chat error:", error);
        setError("Failed to open conversation. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    autoOpenChat();
  }, [matchIdFromUrl, user, navigate]);

  /*
   * ==========================================
   * REAL-TIME CONVERSATION UPDATE
   * ==========================================
   */
  useEffect(() => {
    if (!socket) return;

    const handleConversationUpdated = ({ conversationId, message }) => {
      setConversations((currentConversations) => {
        const existing = currentConversations.find(
          (conv) => conv._id === conversationId
        );

        if (!existing) {
          loadConversations();
          return currentConversations;
        }

        const updated = currentConversations.map((conv) =>
          conv._id === conversationId
            ? {
                ...conv,
                lastMessage: message,
                lastMessageAt: message.createdAt,
              }
            : conv
        );

        return updated.sort(
          (a, b) =>
            new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
        );
      });
    };

    socket.on("conversation_updated", handleConversationUpdated);
    return () => socket.off("conversation_updated", handleConversationUpdated);
  }, [socket]);

  const handleSelectConversation = (conversation) => {
    setSelectedConversation(conversation);
  };

  if (loading) {
    return (
      <main className="messages-page">
        <div className="messages-container">
          <div className="messages-loading">Loading messages...</div>
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
            <p>{error}</p>
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
        {/* CONVERSATION LIST SIDEBAR */}
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
          ) : (
            <div className="conversation-list">
              {conversations.map((conversation) => {
                const otherUser = conversation.user;
                const lastMessage = conversation.lastMessage;

                return (
                  <button
                    key={conversation._id}
                    className={`conversation-item ${
                      selectedConversation?._id === conversation._id
                        ? "conversation-item-active"
                        : ""
                    }`}
                    onClick={() => handleSelectConversation(conversation)}
                  >
                    <div className="conversation-avatar">
                      {otherUser?.photos?.[0]?.url ? (
                        <img
                          src={otherUser.photos[0].url}
                          alt={otherUser.name}
                        />
                      ) : (
                        <span>
                          {otherUser?.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    <div className="conversation-content">
                      <div className="conversation-top">
                        <strong>{otherUser?.name}</strong>
                        {conversation.lastMessageAt && (
                          <time>
                            {new Date(
                              conversation.lastMessageAt
                            ).toLocaleDateString()}
                          </time>
                        )}
                      </div>
                      <p>{lastMessage?.text || "Start a conversation"}</p>
                    </div>
                  </button>
                );
              })}
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
