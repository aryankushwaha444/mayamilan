import {
    useEffect,
    useState,
  } from "react";
  
  import {
    getConversations,
  } from "../services/messageService.js";
  
  import ChatWindow from "../components/ChatWindow.jsx";
  
  import { useSocket } from "../hooks/useSocket.js";
  
  function Messages() {
    const { socket } = useSocket();
  
    const [conversations, setConversations] =
      useState([]);
  
    const [selectedConversation, setSelectedConversation] =
      useState(null);
  
    const [loading, setLoading] =
      useState(true);
  
    const [error, setError] =
      useState("");
  
    const currentUser =
      JSON.parse(
        localStorage.getItem("user") ||
          "null"
      );
  
    /*
     * ==========================================
     * LOAD CONVERSATIONS
     * ==========================================
     */
  
    const loadConversations = async () => {
      try {
        setLoading(true);
        setError("");
  
        const data =
          await getConversations();
  
        setConversations(
          data.conversations || []
        );
      } catch (error) {
        console.error(
          "Load conversations error:",
          error
        );
  
        setError(
          error.response?.data?.message ||
            "Unable to load conversations."
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
     * REAL-TIME CONVERSATION UPDATE
     * ==========================================
     */
  
    useEffect(() => {
      if (!socket) {
        return;
      }
  
      const handleConversationUpdated = ({
        conversationId,
        message,
      }) => {
        setConversations(
          (currentConversations) => {
            const existing =
              currentConversations.find(
                (conversation) =>
                  conversation._id ===
                  conversationId
              );
  
            if (!existing) {
              loadConversations();
              return currentConversations;
            }
  
            const updated =
              currentConversations.map(
                (conversation) =>
                  conversation._id ===
                  conversationId
                    ? {
                        ...conversation,
                        lastMessage:
                          message,
                        lastMessageAt:
                          message.createdAt,
                      }
                    : conversation
              );
  
            return updated.sort(
              (a, b) =>
                new Date(
                  b.lastMessageAt || 0
                ) -
                new Date(
                  a.lastMessageAt || 0
                )
            );
          }
        );
      };
  
      socket.on(
        "conversation_updated",
        handleConversationUpdated
      );
  
      return () => {
        socket.off(
          "conversation_updated",
          handleConversationUpdated
        );
      };
    }, [socket]);
  
    /*
     * ==========================================
     * SELECTED CHAT
     * ==========================================
     */
  
    const handleSelectConversation = (
      conversation
    ) => {
      setSelectedConversation(
        conversation
      );
    };
  
    /*
     * ==========================================
     * LOADING
     * ==========================================
     */
  
    if (loading) {
      return (
        <main className="messages-page">
          <div className="messages-loading">
            Loading messages...
          </div>
        </main>
      );
    }
  
    /*
     * ==========================================
     * ERROR
     * ==========================================
     */
  
    if (error) {
      return (
        <main className="messages-page">
          <div className="messages-error">
            <h2>Messages</h2>
  
            <p>{error}</p>
  
            <button
              type="button"
              onClick={loadConversations}
            >
              Try Again
            </button>
          </div>
        </main>
      );
    }
  
    return (
      <main className="messages-page">
        <div className="messages-container">
          {/* CONVERSATION LIST */}
  
          <aside
            className={`conversation-sidebar ${
              selectedConversation
                ? "conversation-sidebar-hidden-mobile"
                : ""
            }`}
          >
            <div className="conversation-header">
              <h1>Messages</h1>
  
              <span>
                {conversations.length}
              </span>
            </div>
  
            {conversations.length === 0 ? (
              <div className="no-conversations">
                <div>💬</div>
  
                <h3>
                  No conversations yet
                </h3>
  
                <p>
                  Match with someone and start
                  chatting.
                </p>
              </div>
            ) : (
              <div className="conversation-list">
                {conversations.map(
                  (conversation) => {
                    const user =
                      conversation.user;
  
                    const lastMessage =
                      conversation.lastMessage;
  
                    return (
                      <button
                        type="button"
                        key={
                          conversation._id
                        }
                        className={`conversation-item ${
                          selectedConversation?._id ===
                          conversation._id
                            ? "conversation-item-active"
                            : ""
                        }`}
                        onClick={() =>
                          handleSelectConversation(
                            conversation
                          )
                        }
                      >
                        <div className="conversation-avatar">
                          {user?.photos?.[0] ? (
                            <img
                              src={
                                user.photos[0]
                              }
                              alt={
                                user.name
                              }
                            />
                          ) : (
                            <span>
                              {user?.name
                                ?.charAt(
                                  0
                                )
                                ?.toUpperCase() ||
                                "?"}
                            </span>
                          )}
                        </div>
  
                        <div className="conversation-content">
                          <div className="conversation-top">
                            <strong>
                              {user?.name}
                            </strong>
  
                            {conversation.lastMessageAt && (
                              <time>
                                {new Date(
                                  conversation.lastMessageAt
                                ).toLocaleDateString()}
                              </time>
                            )}
                          </div>
  
                          <p>
                            {lastMessage?.text ||
                              "Start a conversation"}
                          </p>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </aside>
  
          {/* CHAT */}
  
          <div
            className={`messages-chat-area ${
              !selectedConversation
                ? "messages-chat-empty-mobile"
                : ""
            }`}
          >
            {selectedConversation ? (
              <ChatWindow
                conversationId={
                  selectedConversation._id
                }
                currentUserId={
                  currentUser?._id ||
                  currentUser?.id
                }
                otherUser={
                  selectedConversation.user
                }
                onBack={() =>
                  setSelectedConversation(
                    null
                  )
                }
              />
            ) : (
              <div className="select-chat">
                <div className="select-chat-icon">
                  💕
                </div>
  
                <h2>
                  Your conversations
                </h2>
  
                <p>
                  Select a conversation to
                  start chatting.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }
  
  export default Messages;