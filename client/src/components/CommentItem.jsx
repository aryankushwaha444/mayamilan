import { useState, useEffect, useRef, memo, useCallback } from "react";
import { Link } from "react-router-dom";
import { postService } from "../services/postService";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useAlert } from "../context/AlertContext";
import { avatarImg } from "../utils/cloudinary";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../hooks/useAuth";

const EMOJIS = ["❤️", "😂", "", "👍", "", "", "", ""];
const MAX_REPLY_DEPTH = 3; // Prevent infinite nesting

function CommentItem({
  comment,
  postId,
  canDelete = false,
  isPostOwner = false,
  isReply = false,
  depth = 0,
  onDeleted,
}) {
  const toast = useAlert();
  const { socket } = useSocket();
  const { user } = useAuth();

  const [showPicker, setShowPicker] = useState(false);
  const [reactions, setReactions] = useState(comment.reactionSummary || []);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replies, setReplies] = useState([]);
  const [showReplies, setShowReplies] = useState(false);
  const [repliesCount, setRepliesCount] = useState(comment.repliesCount || 0);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reacting, setReacting] = useState(false); // ✅ Loading state for reactions

  const pickerRef = useRef(null);
  const repliesRef = useRef(replies); // ✅ Ref to avoid stale closure

  // Keep ref in sync
  useEffect(() => {
    repliesRef.current = replies;
  }, [replies]);

  const authorId = comment.author?._id || "deleted";
  const authorName = comment.author?.name || "Deleted User";

  const avatar = avatarImg(
    comment.author?.photos?.find((p) => p.isPrimary)?.url ||
      comment.author?.photos?.[0]?.url ||
      "/images/default-avatar.png"
  );

  const formatTime = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  // ✅ FIXED: Use ref to avoid stale closure, remove replies from deps
  useEffect(() => {
    if (!socket || isReply) return;

    const handleCommentDeleted = ({ postId: pid, removedIds }) => {
      if (pid !== postId) return;
      const currentReplies = repliesRef.current;
      const removedHere = currentReplies.filter((r) =>
        removedIds.includes(r._id)
      );
      if (removedHere.length === 0) return;

      setReplies((prev) => prev.filter((r) => !removedIds.includes(r._id)));
      setRepliesCount((c) => Math.max(0, c - removedHere.length));
    };

    const handleNewReply = ({ postId: pid, parentCommentId, reply }) => {
      if (pid !== postId || parentCommentId !== comment._id) return;

      const currentReplies = repliesRef.current;
      if (currentReplies.some((r) => r._id === reply._id)) return;

      const enrichedReply = {
        ...reply,
        isMine: String(reply.author?._id) === String(user?._id),
      };

      if (currentReplies.length > 0) {
        setReplies((prev) =>
          prev.some((r) => r._id === reply._id)
            ? prev
            : [...prev, enrichedReply]
        );
      }
      setRepliesCount((c) => c + 1);
    };

    socket.on("comment_deleted", handleCommentDeleted);
    socket.on("new_reply", handleNewReply);

    return () => {
      socket.off("comment_deleted", handleCommentDeleted);
      socket.off("new_reply", handleNewReply);
    };
  }, [socket, postId, isReply, comment._id, user]); // ✅ Removed 'replies' from deps

  // ✅ Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;

    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  // ✅ Optimistic UI for reactions
  const handleReact = useCallback(
    async (emoji) => {
      setShowPicker(false);

      // Optimistic update
      const existingReaction = reactions.find((r) => r.emoji === emoji);
      let optimisticReactions;

      if (existingReaction) {
        if (existingReaction.reactedByMe) {
          // Remove reaction
          optimisticReactions =
            existingReaction.count === 1
              ? reactions.filter((r) => r.emoji !== emoji)
              : reactions.map((r) =>
                  r.emoji === emoji
                    ? { ...r, count: r.count - 1, reactedByMe: false }
                    : r
                );
        } else {
          // Add reaction
          optimisticReactions = reactions.map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.count + 1, reactedByMe: true }
              : r
          );
        }
      } else {
        // New reaction type
        optimisticReactions = [
          ...reactions,
          { emoji, count: 1, reactedByMe: true },
        ];
      }

      setReactions(optimisticReactions);
      setReacting(true);

      try {
        const res = await postService.toggleReaction(comment._id, emoji);
        setReactions(res.reactionSummary);
      } catch (err) {
        console.error(err);
        toast.error("Failed to react");
        // Revert on error
        setReactions(reactions);
      } finally {
        setReacting(false);
      }
    },
    [reactions, comment._id, toast]
  );

  const toggleReplies = async () => {
    if (!showReplies && replies.length === 0) {
      setLoadingReplies(true);
      try {
        const res = await postService.getReplies(postId, comment._id);
        const list =
          res?.replies || res?.data?.replies || (Array.isArray(res) ? res : []);
        setReplies(list);
      } catch (err) {
        console.error("❌ getReplies failed:", err?.response?.status, err);
        toast.error("Failed to load replies");
      }
      setLoadingReplies(false);
    }
    setShowReplies(!showReplies);
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    // ✅ Optimistic UI for reply
    const tempId = `temp-${Date.now()}`;
    const optimisticReply = {
      _id: tempId,
      content: replyText,
      author: user,
      createdAt: new Date().toISOString(),
      isMine: true,
      repliesCount: 0,
    };

    setReplies((prev) => [...prev, optimisticReply]);
    setRepliesCount((c) => c + 1);
    setShowReplies(true);
    setReplyText("");
    setReplying(false);

    try {
      const res = await postService.addReply(postId, comment._id, replyText);
      // Replace optimistic with real
      setReplies((prev) => prev.map((r) => (r._id === tempId ? res.reply : r)));
      setRepliesCount(res.repliesCount);
      toast.success("Reply added 💬");
    } catch (err) {
      console.error(err);
      toast.error("Failed to post reply");
      // Revert on error
      setReplies((prev) => prev.filter((r) => r._id !== tempId));
      setRepliesCount((c) => Math.max(0, c - 1));
    }
  };

  const handleDelete = async () => {
    try {
      await postService.deleteComment(postId, comment._id);
      onDeleted?.(comment._id);
      toast.success("Comment deleted 🗑️");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete comment");
    }
  };

  // ✅ Prevent infinite nesting
  const canReply = !isReply && depth < MAX_REPLY_DEPTH;

  return (
    <div
      className={`comment-item ${isReply ? "comment-reply" : ""}`}
      style={{ marginLeft: isReply ? `${Math.min(depth * 20, 60)}px` : 0 }}
      role="article"
      aria-label={`Comment by ${authorName}`}
    >
      <Link
        to={`/users/${authorId}`}
        aria-label={`View ${authorName}'s profile`}
      >
        <img
          src={avatar}
          alt={`${authorName}'s avatar`}
          className="comment-avatar"
        />
      </Link>

      <div className="comment-thread">
        <div className="comment-bubble">
          <div className="comment-header">
            <strong>{authorName}</strong>
            <time
              dateTime={comment.createdAt}
              aria-label={`Posted ${formatTime(comment.createdAt)}`}
            >
              {formatTime(comment.createdAt)}
            </time>
          </div>
          <p>{comment.content}</p>

          {reactions.length > 0 && (
            <div className="reaction-chips" role="group" aria-label="Reactions">
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  className={`reaction-chip ${r.reactedByMe ? "mine" : ""}`}
                  onClick={() => handleReact(r.emoji)}
                  disabled={reacting}
                  title={r.reactedByMe ? "Remove your reaction" : "React"}
                  aria-label={`${r.emoji} reaction, ${r.count} ${
                    r.count === 1 ? "person" : "people"
                  }${r.reactedByMe ? ", you reacted" : ""}`}
                  aria-pressed={r.reactedByMe}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="comment-actions"
          role="toolbar"
          aria-label="Comment actions"
        >
          <div className="comment-react-wrap" ref={pickerRef}>
            <button
              className="comment-action-link"
              onClick={() => setShowPicker(!showPicker)}
              aria-expanded={showPicker}
              aria-haspopup="true"
              disabled={reacting}
            >
              <i className="bi bi-emoji-smile" aria-hidden="true"></i> React
            </button>

            {showPicker && (
              <div
                className="emoji-picker"
                role="listbox"
                aria-label="Choose a reaction"
              >
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => handleReact(e)}
                    role="option"
                    aria-label={`React with ${e}`}
                    disabled={reacting}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          {canReply && (
            <button
              className="comment-action-link"
              onClick={() => setReplying(!replying)}
              aria-expanded={replying}
            >
              <i className="bi bi-reply" aria-hidden="true"></i> Reply
            </button>
          )}

          {!isReply && repliesCount > 0 && (
            <button
              className="comment-action-link replies-toggle"
              onClick={toggleReplies}
              aria-expanded={showReplies}
              disabled={loadingReplies}
            >
              {loadingReplies
                ? "Loading…"
                : showReplies
                ? "Hide replies"
                : `View ${repliesCount} ${
                    repliesCount === 1 ? "reply" : "replies"
                  }`}
            </button>
          )}

          {canDelete && (
            <button
              className="comment-action-link"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete comment"
            >
              <i className="bi bi-trash" aria-hidden="true"></i> Delete
            </button>
          )}
        </div>

        {replying && (
          <form
            onSubmit={submitReply}
            className="reply-form"
            role="form"
            aria-label="Reply form"
          >
            <input
              autoFocus
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to ${authorName}…`}
              maxLength={500}
              aria-label="Reply text"
            />
            <button
              type="submit"
              disabled={!replyText.trim()}
              aria-label="Send reply"
            >
              <i className="bi bi-send-fill" aria-hidden="true"></i>
            </button>
          </form>
        )}

        {showReplies && (
          <div className="replies-list" role="region" aria-label="Replies">
            {loadingReplies ? (
              <p className="no-comments" aria-live="polite">
                Loading replies…
              </p>
            ) : replies.length > 0 ? (
              replies.map((r) => (
                <CommentItem
                  key={r._id}
                  comment={r}
                  postId={postId}
                  isReply
                  depth={depth + 1}
                  canDelete={r.isMine || isPostOwner}
                  isPostOwner={isPostOwner}
                  onDeleted={(id) => {
                    setReplies((prev) => prev.filter((x) => x._id !== id));
                    setRepliesCount((c) => Math.max(0, c - 1));
                  }}
                />
              ))
            ) : (
              <p className="no-comments">No replies found.</p>
            )}
          </div>
        )}

        <ConfirmDialog
          open={showDeleteConfirm}
          title="Delete this comment?"
          message="This comment will be permanently removed. This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          danger
          icon="bi-trash-fill"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            handleDelete();
          }}
        />
      </div>
    </div>
  );
}

export default memo(CommentItem);
