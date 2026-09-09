import { useEffect, useState } from "react";

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function MessageBubble({ message, isMine, onReact, onDelete, onImageClick }) {
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
    };
  }, [menu]);

  if (message.failed) {
    return (
      <div className={`message-row ${isMine ? "mine" : ""}`}>
        <div className="message-bubble-wrap">
          <div
            className={`message-bubble ${isMine ? "mine" : ""} failed-bubble`}
          >
            <div className="message-text">
              {message.text || "Failed to send"}
            </div>
            <span className="message-time">
              Failed <i className="bi bi-exclamation-circle-fill ms-1"></i>
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (message.deletedForEveryone) {
    return (
      <div className={`message-row ${isMine ? "mine" : ""}`}>
        <div className="message-bubble deleted-bubble">
          <i className="bi bi-slash-circle me-1"></i>
          This message was deleted
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (message.type) {
      case "image":
      case "gif":
        return (
          <img
            src={message.attachment?.url}
            alt="attachment"
            className="message-media"
            onClick={() => onImageClick(message.attachment?.url)}
          />
        );
      case "voice":
        return (
          <audio
            controls
            src={message.attachment?.url}
            className="message-audio"
          />
        );
      case "sticker":
        return <div className="message-sticker">{message.text}</div>;
      case "heart":
        return (
          <div className="message-heart">
            <i className="bi bi-heart-fill"></i>
          </div>
        );
      default:
        return <div className="message-text">{message.text}</div>;
    }
  };

  /* THE TICK LOGIC — this was missing in your file */
  const getStatusIcon = () => {
    if (!isMine) return null;

    if (message.isRead) {
      return (
        <i className="bi bi-circle-fill status-read ms-1" title="Read"></i>
      );
    }
    if (message.isDelivered) {
      return (
        <i
          className="bi bi-check2-all status-delivered ms-1"
          title="Delivered"
        ></i>
      );
    }
    return <i className="bi bi-check2 status-sent ms-1" title="Sent"></i>;
  };

  const reactionCounts = (message.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  const noPad = ["image", "gif", "sticker", "heart"].includes(message.type);

  return (
    <div className={`message-row ${isMine ? "mine" : ""}`}>
      <div className={`message-bubble-wrap ${menu ? "menu-open" : ""}`}>
        <div
          className={`message-bubble ${isMine ? "mine" : ""} ${
            noPad ? "no-pad" : ""
          }`}
        >
          {renderContent()}
          {message.type !== "heart" && (
            <span className="message-time">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {getStatusIcon()}
            </span>
          )}
        </div>

        {Object.keys(reactionCounts).length > 0 && (
          <div className="message-reactions">
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <span key={emoji} className="reaction-chip">
                {emoji}
                {count > 1 ? count : ""}
              </span>
            ))}
          </div>
        )}

        <div className="message-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="React"
            onClick={() => setMenu(menu === "react" ? null : "react")}
          >
            <i className="bi bi-emoji-smile"></i>
          </button>
          <button
            type="button"
            title="Delete"
            onClick={() => setMenu(menu === "delete" ? null : "delete")}
          >
            <i className="bi bi-trash"></i>
          </button>
        </div>

        {menu === "react" && (
          <div
            className="message-menu react-menu"
            onClick={(e) => e.stopPropagation()}
          >
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onReact(e);
                  setMenu(null);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {menu === "delete" && (
          <div
            className="message-menu delete-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onDelete("me");
                setMenu(null);
              }}
            >
              Delete for me
            </button>
            {isMine && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onDelete("everyone");
                  setMenu(null);
                }}
              >
                Delete for everyone
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
