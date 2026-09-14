import { useState, useEffect, memo } from "react";
import { Link } from "react-router-dom";
import { postService } from "../services/postService";
import CommentItem from "./CommentItem.jsx";
import ShareModal from "./ShareModal.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useAlert } from "../context/AlertContext";
import { avatarImg, postImg } from "../utils/cloudinary";
import PhotoLightbox from "./PhotoLightbox.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../hooks/useAuth";

function PostCard({ post, onUpdate }) {
  const toast = useAlert();
  const { socket } = useSocket();
  const { user } = useAuth();

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.content);
  const [showShare, setShowShare] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const authorPhoto = avatarImg(
    post.author?.photos?.find((p) => p.isPrimary)?.url ||
      post.author?.photos?.[0]?.url ||
      "/images/default-avatar.png"
  );

  const formatTime = (date) => {
    const diff = (Date.now() - new Date(date)) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleLike = async () => {
    try {
      const res = await postService.toggleLike(post._id);
      onUpdate({
        ...post,
        isLiked: res.isLiked,
        likes: res.isLiked ? [...post.likes, "dummy"] : post.likes.slice(0, -1),
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update like");
    }
  };

  const handleSave = async () => {
    try {
      const res = await postService.toggleSave(post._id);
      onUpdate({ ...post, isSaved: res.isSaved });
      toast.success(res.isSaved ? "Post saved! 📌" : "Removed from saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save post");
    }
  };

  const loadComments = async () => {
    if (!showComments && comments.length === 0) {
      try {
        const res = await postService.getComments(post._id);
        setComments(res.comments || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load comments");
      }
    }
    setShowComments(!showComments);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await postService.addComment(post._id, commentText);

      // ✅ GUARD: socket may have already added this comment before the API responded
      setComments((prev) => {
        if (prev.some((c) => c._id === res.comment._id)) return prev;
        return [res.comment, ...prev];
      });

      onUpdate({ ...post, commentsCount: res.commentsCount });
      setCommentText("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to post comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    try {
      await postService.deletePost(post._id);
      onUpdate(null);
      toast.success("Post deleted successfully 🗑️");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete post");
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editText.trim()) return;
    try {
      const res = await postService.editPost(post._id, editText);
      onUpdate({ ...post, ...res.post, content: editText, isEdited: true });
      setEditing(false);
      toast.success("Post updated successfully ✏️");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update post");
    }
  };

  // ✅ REAL-TIME COMMENT SYNC
  useEffect(() => {
    if (!socket) return;

    const handleNewComment = ({ postId, comment }) => {
      if (postId !== post._id) return;

      setComments((prev) => {
        // Prevent duplicate (author already added it locally)
        if (prev.some((c) => c._id === comment._id)) return prev;

        return [
          {
            ...comment,
            isMine: String(comment.author?._id) === String(user?._id),
          },
          ...prev,
        ];
      });
    };

    const handleCommentDeleted = ({ postId, removedIds }) => {
      if (postId !== post._id) return;
      setComments((prev) => prev.filter((c) => !removedIds.includes(c._id)));
    };

    socket.on("new_comment", handleNewComment);
    socket.on("comment_deleted", handleCommentDeleted);

    return () => {
      socket.off("new_comment", handleNewComment);
      socket.off("comment_deleted", handleCommentDeleted);
    };
  }, [socket, post._id, user]);

  return (
    <article className="post-card">
      {post.sharedBy && (
        <div className="shared-banner">
          <i className="bi bi-share-fill"></i>
          <span>
            Shared with you by <strong>{post.sharedBy.name}</strong>
          </span>
        </div>
      )}
      <header className="post-header">
        <Link to={`/users/${post.author._id}`} className="post-author">
          <img
            src={authorPhoto}
            alt={post.author.name}
            className="post-avatar"
          />
          <div>
            <div className="post-author-name">
              {post.author.name}
              {post.author.isVerified && (
                <i className="bi bi-patch-check-fill verified-badge"></i>
              )}
            </div>
            <div className="post-meta">
              {formatTime(post.createdAt)}
              {post.isEdited && <span> · edited</span>}
            </div>
          </div>
        </Link>

        {post.isMine && (
          <div className="post-menu">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="post-menu-btn"
            >
              <i className="bi bi-three-dots"></i>
            </button>
            {showMenu && (
              <div className="post-menu-dropdown">
                <button
                  onClick={() => {
                    setEditing(true);
                    setShowMenu(false);
                  }}
                >
                  <i className="bi bi-pencil"></i> Edit
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setShowMenu(false);
                  }}
                  className="delete-action"
                >
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="post-body">
        {editing ? (
          <form onSubmit={handleEdit} className="post-edit-form">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <div className="post-edit-actions">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-sm btn-primary">
                Save
              </button>
            </div>
          </form>
        ) : (
          <p className="post-content">{post.content}</p>
        )}

        {post.images && post.images.length > 0 && (
          <div
            className={`post-images post-images-${Math.min(
              post.images.length,
              4
            )}`}
          >
            {post.images.map((img, i) => (
              <img
                key={i}
                src={postImg(img.url)}
                alt={`Post ${i + 1}`}
                loading="lazy"
                className="post-image-clickable"
                onClick={() => setLightboxIndex(i)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="post-stats">
        <span>
          <strong>{post.likes.length}</strong> likes
        </span>
        <span>
          <strong>{post.commentsCount}</strong> comments
        </span>
        <span>
          <strong>{post.sharesCount || 0}</strong> shares
        </span>
      </div>

      <div className="post-actions">
        <button
          className={`post-action-btn ${post.isLiked ? "liked" : ""}`}
          onClick={handleLike}
        >
          <i
            className={`bi ${post.isLiked ? "bi-heart-fill" : "bi-heart"}`}
          ></i>
          <span>{post.isLiked ? "Liked" : "Like"}</span>
        </button>

        <button
          className={`post-action-btn ${showComments ? "active" : ""}`}
          onClick={loadComments}
        >
          <i className="bi bi-chat"></i>
          <span>Comment</span>
        </button>

        <button
          className={`post-action-btn ${post.isSaved ? "saved" : ""}`}
          onClick={handleSave}
        >
          <i
            className={`bi ${
              post.isSaved ? "bi-bookmark-fill" : "bi-bookmark"
            }`}
          ></i>
          <span>{post.isSaved ? "Saved" : "Save"}</span>
        </button>

        <button className="post-action-btn" onClick={() => setShowShare(true)}>
          <i className="bi bi-share"></i>
          <span>Share</span>
        </button>
      </div>

      {showComments && (
        <div className="post-comments">
          <form onSubmit={handleAddComment} className="comment-form">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              maxLength={500}
            />
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
            >
              <i className="bi bi-send-fill"></i>
            </button>
          </form>

          <div className="comments-list">
            {comments.length === 0 ? (
              <p className="no-comments">No comments yet. Be the first!</p>
            ) : (
              comments.map((c) => (
                <CommentItem
                  key={c._id}
                  comment={c}
                  postId={post._id}
                  canDelete={c.isMine || post.isMine}
                  isPostOwner={post.isMine}
                  onDeleted={(id) => {
                    setComments((prev) => prev.filter((x) => x._id !== id));
                    onUpdate({
                      ...post,
                      commentsCount: Math.max(0, post.commentsCount - 1),
                    });
                  }}
                />
              ))
            )}
          </div>
        </div>
      )}

      {showShare && (
        <ShareModal
          post={post}
          onClose={() => setShowShare(false)}
          onShared={(sharedCount) =>
            onUpdate({ ...post, sharesCount: sharedCount })
          }
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete this post?"
        message="This post and all its comments will be permanently removed. This action cannot be undone."
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
      {lightboxIndex !== null && post.images?.length > 0 && (
        <PhotoLightbox
          photos={post.images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </article>
  );
}

// 👇 CUSTOM COMPARISON FUNCTION - Only re-render when these properties change
function areEqual(prevProps, nextProps) {
  return (
    prevProps.post._id === nextProps.post._id &&
    prevProps.post.content === nextProps.post.content &&
    prevProps.post.likes.length === nextProps.post.likes.length &&
    prevProps.post.commentsCount === nextProps.post.commentsCount &&
    prevProps.post.sharesCount === nextProps.post.sharesCount &&
    prevProps.post.isLiked === nextProps.post.isLiked &&
    prevProps.post.isSaved === nextProps.post.isSaved &&
    prevProps.post.isEdited === nextProps.post.isEdited
  );
}

// 👇 EXPORT WITH MEMO + CUSTOM COMPARISON
export default memo(PostCard, areEqual);
