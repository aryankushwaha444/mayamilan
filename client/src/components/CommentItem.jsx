import { useState, useEffect, memo } from "react";
import { Link } from "react-router-dom";
import { postService } from "../services/postService";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useAlert } from "../context/AlertContext";
import { avatarImg } from "../utils/cloudinary";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../hooks/useAuth";

const EMOJIS = ["❤️", "😂", "", "👍", "🔥", "", "😢", ""];

function CommentItem({
  comment,
  postId,
  canDelete = false,
  isPostOwner = false,
  isReply = false,
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

  // ✅ REAL-TIME: reply deletions AND new replies
  useEffect(() => {
    if (!socket || isReply) return; // only top-level items manage a reply list

    const handleCommentDeleted = ({ postId: pid, removedIds }) => {
      if (pid !== postId) return;
      const removedHere = replies.filter((r) => removedIds.includes(r._id));
      if (removedHere.length === 0) return;
      setReplies((prev) => prev.filter((r) => !removedIds.includes(r._id)));
      setRepliesCount((c) => Math.max(0, c - removedHere.length));
    };

    const handleNewReply = ({ postId: pid, parentCommentId, reply }) => {
      if (pid !== postId || parentCommentId !== comment._id) return;
      // duplicate guard (author already added it locally)
      if (replies.some((r) => r._id === reply._id)) return;

      const enrichedReply = {
        ...reply,
        isMine: String(reply.author?._id) === String(user?._id),
      };

      // append only if the reply list was already loaded/open
      if (replies.length > 0) {
        setReplies((prev) =>
          prev.some((r) => r._id === reply._id)
            ? prev
            : [...prev, enrichedReply]
        );
      }
      // always update the "View N replies" counter
      setRepliesCount((c) => c + 1);
    };

    socket.on("comment_deleted", handleCommentDeleted);
    socket.on("new_reply", handleNewReply);

    return () => {
      socket.off("comment_deleted", handleCommentDeleted);
      socket.off("new_reply", handleNewReply);
    };
  }, [socket, postId, replies, isReply, comment._id, user]);

  const handleReact = async (emoji) => {
    setShowPicker(false);
    try {
      const res = await postService.toggleReaction(comment._id, emoji);
      setReactions(res.reactionSummary);
    } catch (err) {
      console.error(err);
      toast.error("Failed to react");
    }
  };

  const toggleReplies = async () => {
    if (!showReplies && replies.length === 0) {
      setLoadingReplies(true);
      try {
        const res = await postService.getReplies(postId, comment._id);
        const list =
          res?.replies || res?.data?.replies || (Array.isArray(res) ? res : []);
        console.log("🔁 Replies fetched:", list.length, list);
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
    try {
      const res = await postService.addReply(postId, comment._id, replyText);
      // ✅ duplicate guard: socket may have added it first
      setReplies((prev) =>
        prev.some((r) => r._id === res.reply._id) ? prev : [...prev, res.reply]
      );
      setRepliesCount(res.repliesCount);
      setShowReplies(true);
      setReplyText("");
      setReplying(false);
      toast.success("Reply added 💬");
    } catch (err) {
      console.error(err);
      toast.error("Failed to post reply");
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

  return (
    <div className={`comment-item ${isReply ? "comment-reply" : ""}`}>
      <Link to={`/users/${authorId}`}>
        <img src={avatar} alt="" className="comment-avatar" />
      </Link>

      <div className="comment-thread">
        <div className="comment-bubble">
          <div className="comment-header">
            <strong>{authorName}</strong>
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

          {canDelete && (
            <button
              className="comment-action-link"
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
              placeholder={`Reply to ${authorName}…`}
              maxLength={500}
            />
            <button type="submit" disabled={!replyText.trim()}>
              <i className="bi bi-send-fill"></i>
            </button>
          </form>
        )}

        {showReplies && (
          <div className="replies-list">
            {loadingReplies ? (
              <p className="no-comments">Loading replies…</p>
            ) : replies.length > 0 ? (
              replies.map((r) => (
                <CommentItem
                  key={r._id}
                  comment={r}
                  postId={postId}
                  isReply
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
