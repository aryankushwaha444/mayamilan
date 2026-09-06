function MessageBubble({ message, currentUserId }) {
  const isOwnMessage =
    message.sender?._id?.toString() === currentUserId?.toString();

  const formatTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIndicator = () => {
    if (!isOwnMessage) return null;

    // Priority: Read > Delivered > Sent
    if (message.isRead) {
      return <span className="message-status read">●</span>;
    } else if (message.isDelivered) {
      return <span className="message-status delivered">✓✓</span>;
    } else {
      return <span className="message-status sent">✓</span>;
    }
  };

  return (
    <div
      className={`message-row ${
        isOwnMessage ? "message-row-own" : "message-row-other"
      }`}
    >
      <div
        className={`message-bubble ${
          isOwnMessage ? "message-bubble-own" : "message-bubble-other"
        }`}
      >
        <p className="message-text">{message.text}</p>
        <div className="message-meta">
          <span className="message-time">{formatTime(message.createdAt)}</span>
          {getStatusIndicator()}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
