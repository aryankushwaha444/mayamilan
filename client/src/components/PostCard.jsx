import { useState, useEffect, useRef, useCallback, memo } from "react";
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
  const userId = user?._id?.toString();

  // ✅ Keep latest onUpdate without forcing socket re-subscriptions
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const updatePost = useCallback((updater) => {
    onUpdateRef.current?.(updater);
  }, []);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post?.content || "");
  const [showShare, setShowShare] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const menuRef = useRef(null);

  useEffect(() => {
    setEditText(post?.content || "");
  }, [post?.content]);

  const authorPhoto = avatarImg(
    post?.author?.photos?.find((p) => p.isPrimary)?.url ||
      post?.author?.photos?.[0]?.url ||
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

  // Outside click handler for the 3-dots menu
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
    const previousIsLiked = !!post.isLiked;
    const previousLikesCount = Number(
      post.likesCount ?? post.likes?.length ?? 0
    );

    // Optimistic update using server-style counter, not likes array
    updatePost((prev) => {
      const prevLiked = !!prev.isLiked;
      const prevCount = Number(prev.likesCount ?? prev.likes?.length ?? 0);

      return {
        ...prev,
        isLiked: !prevLiked,
        likesCount: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
      };
    });

    try {
      const res = await postService.toggleLike(post._id);
      const serverLikesCount = Number(res?.likesCount);

      // Reconcile with server truth
      updatePost((prev) => ({
        ...prev,
        isLiked: !!res?.isLiked,
        likesCount: Number.isFinite(serverLikesCount)
          ? serverLikesCount
          : Number(prev.likesCount ?? previousLikesCount),
      }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to update like");

      // Revert
      updatePost((prev) => ({
        ...prev,
        isLiked: previousIsLiked,
        likesCount: previousLikesCount,
      }));
    }
  };

  const handleSave = async () => {
    const previousIsSaved = !!post.isSaved;
    const previousSavesCount = Number(post.savesCount ?? 0);

    updatePost((prev) => {
      const prevSaved = !!prev.isSaved;
      const prevCount = Number(prev.savesCount ?? previousSavesCount);

      return {
        ...prev,
        isSaved: !prevSaved,
        savesCount: Math.max(0, prevCount + (prevSaved ? -1 : 1)),
      };
    });

    try {
      const res = await postService.toggleSave(post._id);
      const serverSavesCount = Number(res?.savesCount);

      if (!res?.isSaved) {
        // Confirmed un-save: remove via the null path the parent already handles
        // safely. (No revert happens after a confirmed success, so this is safe.)
        updatePost(null);
      } else {
        updatePost((prev) => ({
          ...prev,
          isSaved: true,
          savesCount: Number.isFinite(serverSavesCount)
            ? serverSavesCount
            : Number(prev.savesCount ?? previousSavesCount),
        }));
      }

      toast.success(res?.isSaved ? "Post saved! 📌" : "Removed from saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save post");

      updatePost((prev) => ({
        ...prev,
        isSaved: previousIsSaved,
        savesCount: previousSavesCount,
      }));
    }
  };

  const loadComments = async () => {
    const nextShow = !showComments;

    if (nextShow && comments.length === 0) {
      try {
        const res = await postService.getComments(post._id);
        setComments(res.comments || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load comments");
      }
    }

    setShowComments(nextShow);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();

    const text = commentText.trim();
    if (!text) return;

    const tempId = `temp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    const optimisticComment = {
      _id: tempId,
      content: text,
      author: user,
      createdAt: new Date().toISOString(),
      isMine: true,
      repliesCount: 0,
      reactionSummary: [],
    };

    const previousCommentsCount = Number(post.commentsCount ?? 0);

    setComments((prev) => [optimisticComment, ...prev]);
    updatePost((prev) => ({
      ...prev,
      commentsCount: Number(prev.commentsCount ?? previousCommentsCount) + 1,
    }));

    setCommentText("");
    setSubmittingComment(true);

    try {
      const res = await postService.addComment(post._id, text);

      setComments((prev) =>
        prev.map((c) => (c._id === tempId ? res.comment : c))
      );

      const serverCommentsCount = Number(res?.commentsCount);

      updatePost((prev) => ({
        ...prev,
        commentsCount: Number.isFinite(serverCommentsCount)
          ? serverCommentsCount
          : Number(prev.commentsCount ?? previousCommentsCount + 1),
      }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to post comment");

      setComments((prev) => prev.filter((c) => c._id !== tempId));
      updatePost((prev) => ({
        ...prev,
        commentsCount: Math.max(
          0,
          Number(prev.commentsCount ?? previousCommentsCount + 1) - 1
        ),
      }));
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    try {
      await postService.deletePost(post._id);
      updatePost(null);
      toast.success("Post deleted successfully 🗑️");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete post");
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();

    const text = editText.trim();
    if (!text) {
      toast.warning("Post content cannot be empty");
      return;
    }

    try {
      const res = await postService.editPost(post._id, text);

      updatePost((prev) => ({
        ...prev,
        ...(res?.post || {}),
        content: text,
        isEdited: true,
        editedAt: res?.post?.editedAt || new Date().toISOString(),
      }));

      setEditing(false);
      toast.success("Post updated successfully ✏️");
    } catch (err) {
      console.error(err);
      // 🔒 Show the REAL server reason (e.g. "Content cannot exceed 2000 characters")
      toast.error(
        err.response?.data?.message || "Failed to update post",
        "Error",
        4000
      );
    }
  };

  // Real-time comment sync
  useEffect(() => {
    if (!socket || !userId) return;

    const handleNewComment = ({ postId, comment }) => {
      if (postId !== post._id) return;

      setComments((prev) => {
        if (prev.some((c) => c._id === comment._id)) return prev;

        return [
          {
            ...comment,
            isMine: String(comment?.author?._id) === userId,
          },
          ...prev,
        ];
      });

      // If this comment is not mine, increment count.
      // If it is mine, optimistic update already incremented it.
      if (String(comment?.author?._id) !== userId) {
        updatePost((prev) => ({
          ...prev,
          commentsCount: Number(prev.commentsCount ?? 0) + 1,
        }));
      }
    };

    const handleCommentDeleted = ({ postId, commentId, commentsCount }) => {
      if (postId !== post._id) return;

      setComments((prev) => prev.filter((c) => c._id !== commentId));

      const count = Number(commentsCount);

      updatePost((prev) => ({
        ...prev,
        commentsCount: Number.isFinite(count)
          ? count
          : Math.max(0, Number(prev.commentsCount ?? 1) - 1),
      }));
    };

    socket.on("new_comment", handleNewComment);
    socket.on("comment_deleted", handleCommentDeleted);

    return () => {
      socket.off("new_comment", handleNewComment);
      socket.off("comment_deleted", handleCommentDeleted);
    };
  }, [socket, post._id, userId, updatePost]);

  const visibleImages = Array.isArray(post.images)
    ? post.images.slice(0, 4)
    : [];

  const remainingImages = (post.images?.length || 0) - 4;

  // ✅ Use server counters, not local arrays
  const likeCount = Number(post.likesCount ?? post.likes?.length ?? 0);
  const commentCount = Number(post.commentsCount ?? comments.length ?? 0);
  const shareCount = Number(post.sharesCount ?? 0);

  return (
    <article
      className="post-card"
      aria-label={`Post by ${post?.author?.name || "Unknown"}`}
    >
      {post.sharedBy && (
        <div className="shared-banner">
          <i className="bi bi-share-fill" aria-hidden="true"></i>
          <span>
            Shared with you by <strong>{post.sharedBy.name}</strong>
          </span>
        </div>
      )}

      <header className="post-header">
        <Link to={`/users/${post.author?._id}`} className="post-author">
          <img src={authorPhoto} alt="" className="post-avatar" />
          <div>
            <div className="post-author-name">
              {post.author?.name}
              {post.author?.isVerified && (
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
                    setEditText(post?.content || "");
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
          <strong>{likeCount}</strong> likes
        </span>

        <span>
          <strong>{commentCount}</strong> comments
        </span>

        <span>
          <strong>{shareCount}</strong> shares
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
                    setComments((prev) => prev.filter((x) => x._id !== id));

                    updatePost((prev) => ({
                      ...prev,
                      commentsCount: Math.max(
                        0,
                        Number(prev.commentsCount ?? 1) - 1
                      ),
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
          onShared={(sharedCount) => {
            const count = Number(sharedCount);

            updatePost((prev) => ({
              ...prev,
              sharesCount: Number.isFinite(count)
                ? count
                : Number(prev.sharesCount ?? 0),
            }));
          }}
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

      {lightboxIndex !== null &&
        Array.isArray(post.images) &&
        post.images.length > 0 && (
          <PhotoLightbox
            photos={post.images}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
    </article>
  );
}

// ✅ Correct memo comparison: compare server counters, not likes array length
function areEqual(prevProps, nextProps) {
  const p = prevProps.post;
  const n = nextProps.post;

  if (!p || !n) return p === n;

  return (
    p._id === n._id &&
    p.content === n.content &&
    Number(p.likesCount ?? p.likes?.length ?? 0) ===
      Number(n.likesCount ?? n.likes?.length ?? 0) &&
    Number(p.savesCount ?? 0) === Number(n.savesCount ?? 0) &&
    Number(p.commentsCount ?? 0) === Number(n.commentsCount ?? 0) &&
    Number(p.sharesCount ?? 0) === Number(n.sharesCount ?? 0) &&
    !!p.isLiked === !!n.isLiked &&
    !!p.isSaved === !!n.isSaved &&
    !!p.isEdited === !!n.isEdited &&
    (p.images?.length || 0) === (n.images?.length || 0)
  );
}

export default memo(PostCard, areEqual);
