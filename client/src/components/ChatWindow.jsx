import {
    useEffect,
    useRef,
    useState,
  } from "react";
  
  import MessageBubble from "./MessageBubble.jsx";
  
  import {
    getMessages,
    sendMessage as sendMessageApi,
    markMessageAsRead,
  } from "../services/messageService.js";
  
  import { useSocket } from "../hooks/useSocket.js";
  
  function ChatWindow({
    conversationId,
    currentUserId,
    otherUser,
    onBack,
  }) {
    const { socket, connected } = useSocket();
  
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
  
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
  
    const [typing, setTyping] = useState(false);
  
    const messagesEndRef = useRef(null);
    const typingTimeoutRef = useRef(null);
  
    /*
     * ==========================================
     * LOAD MESSAGE HISTORY
     * ==========================================
     */
  
    useEffect(() => {
      const loadMessages = async () => {
        try {
          setLoading(true);
  
          const data =
            await getMessages(conversationId);
  
          setMessages(data.messages || []);
        } catch (error) {
          console.error(
            "Load messages error:",
            error
          );
        } finally {
          setLoading(false);
        }
      };
  
      if (conversationId) {
        loadMessages();
      }
    }, [conversationId]);
  
    /*
     * ==========================================
     * JOIN CONVERSATION
     * ==========================================
     */
  
    useEffect(() => {
      if (!socket || !conversationId) {
        return;
      }
  
      socket.emit(
        "join_conversation",
        conversationId
      );
  
      return () => {
        socket.emit(
          "leave_conversation",
          conversationId
        );
      };
    }, [socket, conversationId]);
  
    /*
     * ==========================================
     * REAL-TIME EVENTS
     * ==========================================
     */
  
    useEffect(() => {
      if (!socket) {
        return;
      }
  
      const handleNewMessage = (message) => {
        if (
          message.conversation?.toString() !==
          conversationId?.toString()
        ) {
          return;
        }
  
        setMessages((currentMessages) => {
          const alreadyExists =
            currentMessages.some(
              (item) =>
                item._id === message._id
            );
  
          if (alreadyExists) {
            return currentMessages;
          }
  
          return [...currentMessages, message];
        });
  
        const receiverId =
          message.receiver?._id ||
          message.receiver;
  
        if (
          receiverId?.toString() ===
          currentUserId?.toString()
        ) {
          markMessageAsRead(message._id).catch(
            (error) => {
              console.error(
                "Mark message read error:",
                error
              );
            }
          );
        }
      };
  
      const handleTyping = ({
        userId,
      }) => {
        if (
          userId?.toString() !==
          currentUserId?.toString()
        ) {
          setTyping(true);
        }
      };
  
      const handleStopTyping = ({
        userId,
      }) => {
        if (
          userId?.toString() !==
          currentUserId?.toString()
        ) {
          setTyping(false);
        }
      };
  
      const handleChatError = ({
        message,
      }) => {
        console.error(
          "Chat error:",
          message
        );
      };
  
      socket.on(
        "new_message",
        handleNewMessage
      );
  
      socket.on(
        "user_typing",
        handleTyping
      );
  
      socket.on(
        "user_stopped_typing",
        handleStopTyping
      );
  
      socket.on(
        "chat_error",
        handleChatError
      );
  
      return () => {
        socket.off(
          "new_message",
          handleNewMessage
        );
  
        socket.off(
          "user_typing",
          handleTyping
        );
  
        socket.off(
          "user_stopped_typing",
          handleStopTyping
        );
  
        socket.off(
          "chat_error",
          handleChatError
        );
      };
    }, [
      socket,
      conversationId,
      currentUserId,
    ]);
  
    /*
     * ==========================================
     * AUTO SCROLL
     * ==========================================
     */
  
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }, [messages, typing]);
  
    /*
     * ==========================================
     * SEND MESSAGE
     * ==========================================
     */
  
    const handleSendMessage = async (event) => {
      event.preventDefault();
  
      const cleanText = text.trim();
  
      if (!cleanText || sending) {
        return;
      }
  
      try {
        setSending(true);
  
        if (socket && connected) {
          socket.emit("send_message", {
            conversationId,
            text: cleanText,
          });
  
          setText("");
        } else {
          const data = await sendMessageApi(
            conversationId,
            cleanText
          );
  
          if (data.message) {
            setMessages((currentMessages) => [
              ...currentMessages,
              data.message,
            ]);
          }
  
          setText("");
        }
      } catch (error) {
        console.error(
          "Send message error:",
          error
        );
      } finally {
        setSending(false);
      }
    };
  
    /*
     * ==========================================
     * TYPING
     * ==========================================
     */
  
    const handleTyping = (event) => {
      const value = event.target.value;
  
      setText(value);
  
      if (!socket || !connected) {
        return;
      }
  
      socket.emit(
        "typing",
        conversationId
      );
  
      clearTimeout(
        typingTimeoutRef.current
      );
  
      typingTimeoutRef.current =
        setTimeout(() => {
          socket.emit(
            "stop_typing",
            conversationId
          );
        }, 700);
    };
  
    /*
     * ==========================================
     * ENTER TO SEND
     * ==========================================
     */
  
    const handleKeyDown = (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
  
        handleSendMessage(event);
      }
    };
  
    return (
      <section className="chat-window">
        {/* HEADER */}
  
        <header className="chat-header">
          <button
            type="button"
            className="chat-back-btn"
            onClick={onBack}
          >
            ←
          </button>
  
          <div className="chat-user-info">
            <div className="chat-user-avatar">
              {otherUser?.photos?.[0] ? (
                <img
                  src={otherUser.photos[0]}
                  alt={otherUser.name}
                />
              ) : (
                <span>
                  {otherUser?.name
                    ?.charAt(0)
                    ?.toUpperCase() || "?"}
                </span>
              )}
            </div>
  
            <div>
              <h2>{otherUser?.name}</h2>
  
              <p>
                {typing
                  ? "Typing..."
                  : connected
                  ? "Online"
                  : "Connecting..."}
              </p>
            </div>
          </div>
        </header>
  
        {/* MESSAGES */}
  
        <div className="chat-messages">
          {loading ? (
            <div className="chat-loading">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">
                💬
              </div>
  
              <h3>
                Start the conversation
              </h3>
  
              <p>
                Say hello and see where it goes.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble
                  key={message._id}
                  message={message}
                  currentUserId={
                    currentUserId
                  }
                />
              ))}
  
              {typing && (
                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </>
          )}
  
          <div ref={messagesEndRef} />
        </div>
  
        {/* INPUT */}
  
        <form
          className="chat-input-area"
          onSubmit={handleSendMessage}
        >
          <textarea
            value={text}
            onChange={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            maxLength={2000}
            rows={1}
            disabled={sending}
          />
  
          <button
            type="submit"
            disabled={
              !text.trim() || sending
            }
            className="chat-send-btn"
          >
            {sending ? "..." : "➤"}
          </button>
        </form>
      </section>
    );
  }
  
  export default ChatWindow;