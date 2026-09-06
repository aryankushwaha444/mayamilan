function MessageBubble({ message, currentUserId }) {
    const senderId =
      message.sender?._id || message.sender;
  
    const isMine =
      senderId?.toString() ===
      currentUserId?.toString();
  
    const formattedTime = message.createdAt
      ? new Date(
          message.createdAt
        ).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  
    return (
      <div
        className={`message-row ${
          isMine ? "message-row-own" : "message-row-other"
        }`}
      >
        <div
          className={`message-bubble ${
            isMine
              ? "message-bubble-own"
              : "message-bubble-other"
          }`}
        >
          <p className="message-text">
            {message.text}
          </p>
  
          <div className="message-meta">
            <span>{formattedTime}</span>
  
            {isMine && (
              <span
                className={`message-status ${
                  message.isRead
                    ? "message-read"
                    : ""
                }`}
              >
                {message.isRead ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  export default MessageBubble;