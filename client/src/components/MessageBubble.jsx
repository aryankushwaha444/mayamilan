import { useEffect, useState, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";

const REACTIONS = ["❤️", "😂", "", "😢", "😡", "👍"];

function MessageBubble({
  message,
  isMine,
  onReact,
  onDelete,
  onImageClick,
  onRetry,
}) {
  const [menu, setMenu] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const bubbleRef = useRef(null);

  // ✅ FIXED: Proper outside click handling without setTimeout hack
  useEffect(() => {
    if (!menu) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenu(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menu]);

  // ✅ Retry handler for failed messages
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry(message);
    }
  }, [onRetry, message]);

  if (message.failed) {
    return (
      <div className={`message-row ${isMine ? "mine" : ""}`} role="alert">
        <div className="message-bubble-wrap">
          <div
            className={`message-bubble ${isMine ? "mine" : ""} failed-bubble`}
          >
            <div className="message-text">
              {message.text || "Failed to send"}
            </div>
            <div className="message-failed-actions">
              <span className="message-time">
                Failed{" "}
                <i
                  className="bi bi-exclamation-circle-fill ms-1"
                  aria-hidden="true"
                ></i>
              </span>
              {onRetry && (
                <button
                  type="button"
                  className="retry-btn"
                  onClick={handleRetry}
                  aria-label="Retry sending message"
                >
                  <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (message.deletedForEveryone) {
    return (
      <div className={`message-row ${isMine ? "mine" : ""}`}>
        <div className="message-bubble deleted-bubble" role="status">
          <i className="bi bi-slash-circle me-1" aria-hidden="true"></i>
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
          <div className="message-media-wrapper">
            {!imageLoaded && !imageError && (
              <div className="message-media-skeleton" aria-hidden="true">
                <div className="skeleton-shimmer"></div>
              </div>
            )}
            {imageError ? (
              <div className="message-media-error" role="alert">
                <i className="bi bi-image-alt" aria-hidden="true"></i>
                <span>Failed to load</span>
              </div>
            ) : (
              <img
                src={message.attachment?.url}
                alt={message.type === "gif" ? "Animated GIF" : "Shared image"}
                className={`message-media ${imageLoaded ? "loaded" : ""}`}
                loading="lazy"
                decoding="async"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                onClick={() => onImageClick?.(message.attachment?.url)}
                style={{ cursor: "pointer" }}
              />
            )}
          </div>
        );
      case "voice":
        return (
          <audio
            controls
            src={message.attachment?.url}
            className="message-audio"
            aria-label="Voice message"
          >
            Your browser does not support audio playback.
          </audio>
        );
      case "sticker":
        return (
          <div
            className="message-sticker"
            role="img"
            aria-label={`Sticker: ${message.text}`}
          >
            {message.text}
          </div>
        );
      case "heart":
        return (
          <div className="message-heart" role="img" aria-label="Heart reaction">
            <i className="bi bi-heart-fill" aria-hidden="true"></i>
          </div>
        );
      case "post":
        // Post was deleted after sharing
        if (!message.post) {
          return (
            <div className="chat-shared-post chat-shared-dead" role="status">
              <div className="chat-shared-label">
                <i className="bi bi-share-fill" aria-hidden="true"></i> Shared
                post
              </div>
              <p className="chat-shared-content">
                <i className="bi bi-slash-circle me-1" aria-hidden="true"></i>
                This post is no longer available
              </p>
            </div>
          );
        }

        // Safe post ID extraction
        const postId =
          typeof message.post === "string"
            ? message.post
            : message.post?._id || message.post?.id;

        if (!postId) {
          return (
            <div className="chat-shared-post chat-shared-dead" role="status">
              <div className="chat-shared-label">
                <i className="bi bi-share-fill" aria-hidden="true"></i> Shared
                post
              </div>
              <p className="chat-shared-content">
                <i className="bi bi-slash-circle me-1" aria-hidden="true"></i>
                This post is no longer available
              </p>
            </div>
          );
        }

        return (
          <div
            className="chat-shared-post chat-shared-clickable"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/post/${postId}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(`/post/${postId}`);
              }
            }}
            aria-label={`View shared post by ${
              message.post.author?.name || "unknown"
            }`}
          >
            <div className="chat-shared-label">
              <i className="bi bi-share-fill" aria-hidden="true"></i> Shared
              post
            </div>

            {message.post.images?.[0] && (
              <img
                src={message.post.images[0].url}
                alt=""
                className="chat-shared-img"
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  onImageClick?.(message.post.images[0].url);
                }}
              />
            )}

            <p className="chat-shared-content">
              {message.post.content || message.text || "Shared post"}
            </p>

            {message.post.author && (
              <small className="chat-shared-author">
                by {message.post.author.name}
              </small>
            )}

            <div className="chat-shared-cta">
              <span>View post</span>
              <i
                className="bi bi-arrow-right-circle-fill"
                aria-hidden="true"
              ></i>
            </div>
          </div>
        );
      default:
        return <div className="message-text">{message.text}</div>;
    }
  };

  const getStatusIcon = () => {
    if (!isMine) return null;

    if (message.isRead) {
      return (
        <i
          className="bi bi-circle-fill status-read ms-1"
          title="Read"
          aria-label="Message read"
        ></i>
      );
    }
    if (message.isDelivered) {
      return (
        <i
          className="bi bi-check2-all status-delivered ms-1"
          title="Delivered"
          aria-label="Message delivered"
        ></i>
      );
    }
    return (
      <i
        className="bi bi-check2 status-sent ms-1"
        title="Sent"
        aria-label="Message sent"
      ></i>
    );
  };

  const reactionCounts = (message.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  const noPad = ["image", "gif", "sticker", "heart", "post"].includes(
    message.type
  );

  return (
    <div
      className={`message-row ${isMine ? "mine" : ""}`}
      ref={bubbleRef}
      role="listitem"
      aria-label={`${isMine ? "You" : "Other user"}: ${
        message.text || message.type
      } at ${new Date(message.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`}
    >
      <div className={`message-bubble-wrap ${menu ? "menu-open" : ""}`}>
        <div
          className={`message-bubble ${isMine ? "mine" : ""} ${
            noPad ? "no-pad" : ""
          }`}
        >
          {renderContent()}
          {message.type !== "heart" && (
            <span className="message-time">
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              {getStatusIcon()}
            </span>
          )}
        </div>

        {Object.keys(reactionCounts).length > 0 && (
          <div
            className="message-reactions"
            role="group"
            aria-label="Reactions"
          >
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <span
                key={emoji}
                className="reaction-chip"
                aria-label={`${emoji} reaction, ${count} ${
                  count === 1 ? "person" : "people"
                }`}
              >
                {emoji}
                {count > 1 ? count : ""}
              </span>
            ))}
          </div>
        )}

        <div
          className="message-actions"
          onClick={(e) => e.stopPropagation()}
          ref={menuRef}
          role="toolbar"
          aria-label="Message actions"
        >
          <button
            type="button"
            title="React"
            aria-label="Add reaction"
            aria-expanded={menu === "react"}
            aria-haspopup="true"
            onClick={() => setMenu(menu === "react" ? null : "react")}
          >
            <i className="bi bi-emoji-smile" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            title="Delete"
            aria-label="Delete message"
            aria-expanded={menu === "delete"}
            aria-haspopup="true"
            onClick={() => setMenu(menu === "delete" ? null : "delete")}
          >
            <i className="bi bi-trash" aria-hidden="true"></i>
          </button>
        </div>

        {menu === "react" && (
          <div
            className="message-menu react-menu"
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Choose a reaction"
          >
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                aria-label={`React with ${emoji}`}
                onClick={() => {
                  onReact(emoji);
                  setMenu(null);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {menu === "delete" && (
          <div
            className="message-menu delete-menu"
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Delete options"
          >
            <button
              type="button"
              role="menuitem"
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
                role="menuitem"
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

export default memo(MessageBubble);
