import { useState } from "react";
import { Link } from "react-router-dom";
import { postService } from "../services/postService";
import ConfirmDialog from "./ConfirmDialog.jsx"; // 👈 ADD
import { useAlert } from "../context/AlertContext"; // 👈 ADD

const EMOJIS = ["❤️", "😂", "", "👍", "🔥", "", "😢", ""];

function CommentItem({ comment, postId, isReply = false, onDeleted }) {
  const toast = useAlert(); // 👈 ADD

  const [showPicker, setShowPicker] = useState(false);
  const [reactions, setReactions] = useState(comment.reactionSummary || []);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replies, setReplies] = useState([]);
  const [showReplies, setShowReplies] = useState(false);
  const [repliesCount, setRepliesCount] = useState(comment.repliesCount || 0);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false); // 👈 ADD

  const avatar =
    comment.author?.photos?.find((p) => p.isPrimary)?.url ||
    comment.author?.photos?.[0]?.url ||
    "/images/default-avatar.png";

  const formatTime = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const handleReact = async (emoji) => {
    setShowPicker(false);
    try {
      const res = await postService.toggleReaction(comment._id, emoji);
      setReactions(res.reactionSummary);
    } catch (err) {
      console.error(err);
      toast.error("Failed to react"); // 👈 ADD
    }
  };

  const toggleReplies = async () => {
    if (!showReplies && replies.length === 0) {
      setLoadingReplies(true);
      try {
        const res = await postService.getReplies(comment._id);
        setReplies(res.replies || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load replies"); // 👈 ADD
      }
      setLoadingReplies(false);
    }
    setShowReplies(!showReplies);
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    try {
      const res = await postService.addReply(postId, comment._id, replyText);
      setReplies((prev) => [...prev, res.reply]);
      setRepliesCount(res.repliesCount);
      setShowReplies(true);
      setReplyText("");
      setReplying(false);
      toast.success("Reply added 💬"); // 👈 ADD
    } catch (err) {
      console.error(err);
      toast.error("Failed to post reply"); // 👈 ADD
    }
  };

  // 👇 UPDATED: no longer uses window.confirm
  const handleDelete = async () => {
    try {
      await postService.deleteComment(postId, comment._id);
      onDeleted?.(comment._id);
      toast.success("Comment deleted 🗑️"); // 👈 UPDATED (was alert)
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete comment"); // 👈 UPDATED (was alert)
    }
  };

  return (
    <div className={`comment-item ${isReply ? "comment-reply" : ""}`}>
      <Link to={`/users/${comment.author._id}`}>
        <img src={avatar} alt="" className="comment-avatar" />
      </Link>

      <div className="comment-thread">
        <div className="comment-bubble">
          <div className="comment-header">
            <strong>{comment.author.name}</strong>
            <span>{formatTime(comment.createdAt)}</span>
          </div>
          <p>{comment.content}</p>

          {reactions.length > 0 && (
            <div className="reaction-chips">
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  className={`reaction-chip ${r.reactedByMe ? "mine" : ""}`}
                  onClick={() => handleReact(r.emoji)}
                  title={r.reactedByMe ? "Remove your reaction" : "React"}
                >
                  <span>{r.emoji}</span>
                  {r.count}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="comment-actions">
          <div className="comment-react-wrap">
            <button
              className="comment-action-link"
              onClick={() => setShowPicker(!showPicker)}
            >
              <i className="bi bi-emoji-smile"></i> React
            </button>

            {showPicker && (
              <>
                <div
                  className="picker-backdrop"
                  onClick={() => setShowPicker(false)}
                />
                <div className="emoji-picker">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => handleReact(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {!isReply && (
            <button
              className="comment-action-link"
              onClick={() => setReplying(!replying)}
            >
              <i className="bi bi-reply"></i> Reply
            </button>
          )}

          {!isReply && repliesCount > 0 && (
            <button
              className="comment-action-link replies-toggle"
              onClick={toggleReplies}
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

          {comment.isMine && (
            // 👇 UPDATED: opens confirm dialog instead of calling handleDelete directly
            <button
              className="comment-action-link danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <i className="bi bi-trash"></i> Delete
            </button>
          )}
        </div>

        {replying && (
          <form onSubmit={submitReply} className="reply-form">
            <input
              autoFocus
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to ${comment.author.name}…`}
              maxLength={500}
            />
            <button type="submit" disabled={!replyText.trim()}>
              <i className="bi bi-send-fill"></i>
            </button>
          </form>
        )}

        {showReplies && replies.length > 0 && (
          <div className="replies-list">
            {replies.map((r) => (
              <CommentItem
                key={r._id}
                comment={r}
                postId={postId}
                isReply
                onDeleted={(id) => {
                  setReplies((prev) => prev.filter((x) => x._id !== id));
                  setRepliesCount((c) => Math.max(0, c - 1));
                }}
              />
            ))}
          </div>
        )}

        {/* 👇 NEW: Delete confirmation dialog */}
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

export default CommentItem;
