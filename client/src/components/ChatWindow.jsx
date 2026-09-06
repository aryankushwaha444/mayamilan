import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble.jsx";
import {
  getMessages,
  sendMessage as sendMessageApi,
} from "../services/messageService.js";
import { useSocket } from "../hooks/useSocket.js";

function ChatWindow({ conversationId, currentUserId, otherUser, onBack }) {
  const { socket, connected } = useSocket();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);

  const [otherUserOnline, setOtherUserOnline] = useState(
    Boolean(otherUser?.isOnline)
  );

  const typingTimeoutRef = useRef(null);
  const messagesContainerRef = useRef(null);

  /*
   * ==========================================
   * SYNC ONLINE STATUS WHEN otherUser CHANGES
   * ==========================================
   */
  useEffect(() => {
    setOtherUserOnline(Boolean(otherUser?.isOnline));
  }, [otherUser]);

  /*
   * ==========================================
   * REAL-TIME ONLINE / OFFLINE PRESENCE
   * ==========================================
   */
  useEffect(() => {
    if (!socket) return;

    const otherUserId = otherUser?._id?.toString();

    const handleUserOnline = ({ userId }) => {
      if (userId?.toString() === otherUserId) {
        setOtherUserOnline(true);
      }
    };

    const handleUserOffline = ({ userId }) => {
      if (userId?.toString() === otherUserId) {
        setOtherUserOnline(false);
      }
    };

    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);

    return () => {
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
    };
  }, [socket, otherUser]);

  /*
   * ==========================================
   * ASK SERVER FOR THE OTHER USER'S LIVE STATUS
   * ==========================================
   */
  useEffect(() => {
    if (!socket || !otherUser?._id) return;

    const otherUserId = otherUser._id.toString();

    const handlePresenceResult = ({ userId, isOnline }) => {
      if (userId?.toString() === otherUserId) {
        setOtherUserOnline(isOnline);
      }
    };

    socket.on("presence_result", handlePresenceResult);
    socket.emit("check_presence", { userId: otherUserId });

    return () => {
      socket.off("presence_result", handlePresenceResult);
    };
  }, [socket, otherUser]);

  /*
   * ==========================================
   * LOAD MESSAGE HISTORY
   * ==========================================
   */
  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        const data = await getMessages(conversationId);
        setMessages(data.messages || []);
      } catch (error) {
        console.error("Load messages error:", error);
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
    if (!socket || !conversationId) return;

    socket.emit("join_conversation", conversationId);

    return () => {
      socket.emit("leave_conversation", conversationId);
    };
  }, [socket, conversationId]);

  /*
   * ==========================================
   * REAL-TIME CHAT EVENTS
   * ==========================================
   */
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message) => {
      if (message.conversation?.toString() !== conversationId?.toString()) {
        return;
      }

      setMessages((currentMessages) => {
        const alreadyExists = currentMessages.some(
          (item) => item._id === message._id
        );
        if (alreadyExists) return currentMessages;
        return [...currentMessages, message];
      });

      const receiverId = message.receiver?._id || message.receiver;
      if (receiverId?.toString() === currentUserId?.toString()) {
        socket.emit("mark_delivered", { messageId: message._id });
      }
    };

    const handleMessageDelivered = ({ messageId }) => {
      setMessages((currentMessages) =>
        currentMessages.map((msg) =>
          msg._id === messageId ? { ...msg, isDelivered: true } : msg
        )
      );
    };

    const handleMessageRead = ({ messageId }) => {
      setMessages((currentMessages) =>
        currentMessages.map((msg) =>
          msg._id === messageId
            ? { ...msg, isRead: true, isDelivered: true }
            : msg
        )
      );
    };

    const handleTyping = ({ userId }) => {
      if (userId?.toString() !== currentUserId?.toString()) setTyping(true);
    };

    const handleStopTyping = ({ userId }) => {
      if (userId?.toString() !== currentUserId?.toString()) setTyping(false);
    };

    const handleChatError = ({ message }) => {
      console.error("Chat error:", message);
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_delivered", handleMessageDelivered);
    socket.on("message_read", handleMessageRead);
    socket.on("user_typing", handleTyping);
    socket.on("user_stopped_typing", handleStopTyping);
    socket.on("chat_error", handleChatError);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_delivered", handleMessageDelivered);
      socket.off("message_read", handleMessageRead);
      socket.off("user_typing", handleTyping);
      socket.off("user_stopped_typing", handleStopTyping);
      socket.off("chat_error", handleChatError);
    };
  }, [socket, conversationId, currentUserId]);

  /*
   * ==========================================
   * MARK MESSAGES AS READ
   * ==========================================
   */
  useEffect(() => {
    if (!socket || !conversationId || messages.length === 0 || userScrolled)
      return;

    messages.forEach((message) => {
      const receiverId = message.receiver?._id || message.receiver;
      if (
        receiverId?.toString() === currentUserId?.toString() &&
        !message.isRead
      ) {
        socket.emit("mark_read", { messageId: message._id });
      }
    });
  }, [messages, socket, conversationId, currentUserId, userScrolled]);

  /*
   * ==========================================
   * SMART AUTO SCROLL
   * ==========================================
   */
  const scrollToBottom = (smooth = true) => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  };

  useEffect(() => {
    if (!userScrolled) scrollToBottom(true);
  }, [messages, typing, userScrolled]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      setUserScrolled(!isNearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  /*
   * ==========================================
   * SEND MESSAGE
   * ==========================================
   */
  const handleSendMessage = async (event) => {
    if (event) event.preventDefault();

    const cleanText = text.trim();
    if (!cleanText || sending) return;

    try {
      setSending(true);

      if (socket && connected) {
        socket.emit("send_message", { conversationId, text: cleanText });
        setText("");
      } else {
        const data = await sendMessageApi(conversationId, cleanText);
        if (data.message) {
          setMessages((currentMessages) => [...currentMessages, data.message]);
        }
        setText("");
      }

      setTimeout(() => {
        scrollToBottom(false);
        setUserScrolled(false);
      }, 50);
    } catch (error) {
      console.error("Send message error:", error);
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

    if (!socket || !connected) return;

    socket.emit("typing", conversationId);
    clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop_typing", conversationId);
    }, 700);
  };

  /*
   * ==========================================
   * ENTER TO SEND
   * ==========================================
   */
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage(event);
    }
  };

  return (
    <section className="chat-window">
      {/* HEADER */}
      <header className="chat-header">
        <button type="button" className="chat-back-btn" onClick={onBack}>
          ←
        </button>
        <div className="chat-user-info">
          <div className="chat-user-avatar">
            {otherUser?.photos?.[0]?.url ? (
              <img src={otherUser.photos[0].url} alt={otherUser.name} />
            ) : (
              <span>{otherUser?.name?.charAt(0)?.toUpperCase() || "?"}</span>
            )}
          </div>
          <div>
            <h2>{otherUser?.name}</h2>
            <p className={otherUserOnline ? "status-online" : "status-offline"}>
              {typing ? "Typing..." : otherUserOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>
      </header>

      {/* MESSAGES */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {loading ? (
          <div className="chat-loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <h3>Start the conversation</h3>
            <p>Say hello and see where it goes.</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message._id}
                message={message}
                currentUserId={currentUserId}
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
      </div>

      {/* INPUT */}
      <form className="chat-input-area" onSubmit={handleSendMessage}>
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
          disabled={!text.trim() || sending}
          className="chat-send-btn"
        >
          {sending ? "..." : "➤"}
        </button>
      </form>
    </section>
  );
}

export default ChatWindow;
