import { useState, useEffect, useRef, memo } from "react";
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

  const menuRef = useRef(null);

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

  // ✅ FIXED: Outside click handler for the 3-dots menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLike = async () => {
    // ✅ Optimistic UI Update
    const previousIsLiked = post.isLiked;
    const previousLikesCount = post.likes.length;

    onUpdate({
      ...post,
      isLiked: !previousIsLiked,
      likes: !previousIsLiked
        ? [...post.likes, user._id]
        : post.likes.filter((id) => id !== user._id),
    });

    try {
      const res = await postService.toggleLike(post._id);
      // Reconcile with server truth
      onUpdate({
        ...post,
        isLiked: res.isLiked,
        likes: Array.isArray(res.likes) ? res.likes : post.likes, // Assuming server returns array or count
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to update like");
      // Revert on error
      onUpdate({
        ...post,
        isLiked: previousIsLiked,
        likes: previousIsLiked
          ? [...post.likes, user._id]
          : post.likes.filter((id) => id !== user._id),
      });
    }
  };

  const handleSave = async () => {
    const previousIsSaved = post.isSaved;
    onUpdate({ ...post, isSaved: !previousIsSaved });

    try {
      const res = await postService.toggleSave(post._id);
      onUpdate({ ...post, isSaved: res.isSaved });
      toast.success(res.isSaved ? "Post saved! 📌" : "Removed from saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save post");
      onUpdate({ ...post, isSaved: previousIsSaved }); // Revert
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

    // ✅ Optimistic UI for Comments
    const tempId = `temp-${Date.now()}`;
    const optimisticComment = {
      _id: tempId,
      content: commentText,
      author: user,
      createdAt: new Date().toISOString(),
      isMine: true,
      repliesCount: 0,
    };

    setComments((prev) => [optimisticComment, ...prev]);
    onUpdate({ ...post, commentsCount: post.commentsCount + 1 });
    setCommentText("");
    setSubmittingComment(true);

    try {
      const res = await postService.addComment(post._id, commentText);

      // Replace optimistic comment with real one
      setComments((prev) =>
        prev.map((c) => (c._id === tempId ? res.comment : c))
      );
      onUpdate({ ...post, commentsCount: res.commentsCount });
    } catch (err) {
      console.error(err);
      toast.error("Failed to post comment");
      // Revert on error
      setComments((prev) => prev.filter((c) => c._id !== tempId));
      onUpdate({ ...post, commentsCount: Math.max(0, post.commentsCount - 1) });
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
        if (prev.some((c) => c._id === comment._id)) return prev;
        return [
          {
            ...comment,
            isMine: String(comment.author?._id) === String(user?._id),
          },
          ...prev,
        ];
      });

      // Only update count if we aren't the ones who just posted it optimistically
      if (String(comment.author?._id) !== String(user?._id)) {
        onUpdate((prevPost) => ({
          ...prevPost,
          commentsCount: prevPost.commentsCount + 1,
        }));
      }
    };

    const handleCommentDeleted = ({ postId, removedIds }) => {
      if (postId !== post._id) return;

      let deletedCount = 0;
      setComments((prev) => {
        const filtered = prev.filter((c) => !removedIds.includes(c._id));
        deletedCount = prev.length - filtered.length;
        return filtered;
      });

      if (deletedCount > 0) {
        onUpdate((prevPost) => ({
          ...prevPost,
          commentsCount: Math.max(0, prevPost.commentsCount - deletedCount),
        }));
      }
    };

    socket.on("new_comment", handleNewComment);
    socket.on("comment_deleted", handleCommentDeleted);

    return () => {
      socket.off("new_comment", handleNewComment);
      socket.off("comment_deleted", handleCommentDeleted);
    };
  }, [socket, post._id, user, onUpdate]);

  // Calculate images to show (max 4, with overflow indicator)
  const visibleImages = post.images?.slice(0, 4) || [];
  const remainingImages = (post.images?.length || 0) - 4;

  return (
    <article className="post-card" aria-label={`Post by ${post.author.name}`}>
      {post.sharedBy && (
        <div className="shared-banner">
          <i className="bi bi-share-fill" aria-hidden="true"></i>
          <span>
            Shared with you by <strong>{post.sharedBy.name}</strong>
          </span>
        </div>
      )}

      <header className="post-header">
        <Link to={`/users/${post.author._id}`} className="post-author">
          <img src={authorPhoto} alt="" className="post-avatar" />
          <div>
            <div className="post-author-name">
              {post.author.name}
              {post.author.isVerified && (
                <i
                  className="bi bi-patch-check-fill verified-badge"
                  aria-label="Verified"
                  title="Verified"
                ></i>
              )}
            </div>
            <div className="post-meta">
              <time dateTime={post.createdAt}>
                {formatTime(post.createdAt)}
              </time>
              {post.isEdited && <span> · edited</span>}
            </div>
          </div>
        </Link>

        {post.isMine && (
          <div className="post-menu" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="post-menu-btn"
              aria-label="Post options"
              aria-expanded={showMenu}
              aria-haspopup="true"
            >
              <i className="bi bi-three-dots" aria-hidden="true"></i>
            </button>
            {showMenu && (
              <div className="post-menu-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setEditing(true);
                    setShowMenu(false);
                  }}
                >
                  <i className="bi bi-pencil" aria-hidden="true"></i> Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setShowMenu(false);
                  }}
                  className="delete-action"
                >
                  <i className="bi bi-trash" aria-hidden="true"></i> Delete
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
              aria-label="Edit post content"
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

        {visibleImages.length > 0 && (
          <div className={`post-images post-images-${visibleImages.length}`}>
            {visibleImages.map((img, i) => (
              <div key={i} className="post-image-wrapper">
                <img
                  src={postImg(img.url)}
                  alt={`Post attachment ${i + 1}`}
                  loading="lazy"
                  className="post-image-clickable"
                  onClick={() => setLightboxIndex(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setLightboxIndex(i)}
                />
                {/* ✅ Overlay for extra images */}
                {i === 3 && remainingImages > 0 && (
                  <div
                    className="post-image-overlay"
                    onClick={() => setLightboxIndex(3)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setLightboxIndex(3)}
                  >
                    <span>+{remainingImages}</span>
                  </div>
                )}
              </div>
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

      <div className="post-actions" role="group" aria-label="Post actions">
        <button
          type="button"
          className={`post-action-btn ${post.isLiked ? "liked" : ""}`}
          onClick={handleLike}
          aria-pressed={post.isLiked}
          aria-label={post.isLiked ? "Unlike post" : "Like post"}
        >
          <i
            className={`bi ${post.isLiked ? "bi-heart-fill" : "bi-heart"}`}
            aria-hidden="true"
          ></i>
          <span>{post.isLiked ? "Liked" : "Like"}</span>
        </button>

        <button
          type="button"
          className={`post-action-btn ${showComments ? "active" : ""}`}
          onClick={loadComments}
          aria-expanded={showComments}
          aria-label="Comment on post"
        >
          <i className="bi bi-chat" aria-hidden="true"></i>
          <span>Comment</span>
        </button>

        <button
          type="button"
          className={`post-action-btn ${post.isSaved ? "saved" : ""}`}
          onClick={handleSave}
          aria-pressed={post.isSaved}
          aria-label={post.isSaved ? "Unsave post" : "Save post"}
        >
          <i
            className={`bi ${
              post.isSaved ? "bi-bookmark-fill" : "bi-bookmark"
            }`}
            aria-hidden="true"
          ></i>
          <span>{post.isSaved ? "Saved" : "Save"}</span>
        </button>

        <button
          type="button"
          className="post-action-btn"
          onClick={() => setShowShare(true)}
          aria-label="Share post"
        >
          <i className="bi bi-share" aria-hidden="true"></i>
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
              aria-label="Write a comment"
            />
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              aria-label="Post comment"
            >
              <i className="bi bi-send-fill" aria-hidden="true"></i>
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
                    // Handled by socket usually, but good fallback
                    setComments((prev) => prev.filter((x) => x._id !== id));
                    onUpdate((prevPost) => ({
                      ...prevPost,
                      commentsCount: Math.max(0, prevPost.commentsCount - 1),
                    }));
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
            onUpdate((prevPost) => ({ ...prevPost, sharesCount: sharedCount }))
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

// 👇 CUSTOM COMPARISON FUNCTION
function areEqual(prevProps, nextProps) {
  return (
    prevProps.post._id === nextProps.post._id &&
    prevProps.post.content === nextProps.post.content &&
    prevProps.post.likes.length === nextProps.post.likes.length &&
    prevProps.post.commentsCount === nextProps.post.commentsCount &&
    prevProps.post.sharesCount === nextProps.post.sharesCount &&
    prevProps.post.isLiked === nextProps.post.isLiked &&
    prevProps.post.isSaved === nextProps.post.isSaved &&
    prevProps.post.isEdited === nextProps.post.isEdited &&
    prevProps.post.images?.length === nextProps.post.images?.length
  );
}

export default memo(PostCard, areEqual);
