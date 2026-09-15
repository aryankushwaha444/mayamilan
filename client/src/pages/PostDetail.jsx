import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { postService } from "../services/postService.js";
import PostCard from "../components/PostCard.jsx";
import SEO from "../components/SEO.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { useAuth } from "../hooks/useAuth";

function PostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ✅ THE MISSING PIECE — actually load the post from the API
  useEffect(() => {
    let cancelled = false;

    const loadPost = async () => {
      try {
        setLoading(true);
        setError("");
        setPost(null);

        const res = await postService.getPost(postId);
        if (cancelled) return;

        if (res?.post) {
          setPost(res.post);
        } else {
          setError("This post doesn't exist anymore.");
        }
      } catch (err) {
        if (cancelled) return;
        console.error("❌ Load post error:", err?.response?.status, err);

        const status = err.response?.status;
        if (status === 404) {
          setError("This post doesn't exist anymore.");
        } else if (status === 401) {
          setError("Your session expired. Please log in again.");
        } else {
          setError(err.response?.data?.message || "Failed to load post.");
        }
      } finally {
        if (!cancelled) setLoading(false); // ✅ loading can now become false
      }
    };

    loadPost();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // ✅ REAL-TIME SYNC (shares + likes + comments + post deleted)
  useEffect(() => {
    if (!socket || !post) return;

    const sameId = (pid) => pid === post._id;

    const handleSharesUpdated = ({ postId: pid, sharesCount }) => {
      if (sameId(pid))
        setPost((prev) => (prev ? { ...prev, sharesCount } : prev));
    };

    const handleLikesUpdated = ({ postId: pid, likesCount }) => {
      if (!sameId(pid)) return;
      setPost((prev) => {
        if (!prev) return prev;
        const arr = Array.isArray(prev.likes) ? [...prev.likes] : [];
        if (arr.length === likesCount) return { ...prev, likesCount };

        const me = user?._id ? String(user._id) : null;
        if (arr.length < likesCount) {
          while (arr.length < likesCount)
            arr.push(`sync_${arr.length}_${Date.now()}`);
        } else {
          while (arr.length > likesCount) {
            let idx = arr.length - 1;
            while (idx >= 0 && me && String(arr[idx]) === me) idx--;
            if (idx < 0) break;
            arr.splice(idx, 1);
          }
        }
        return { ...prev, likes: arr, likesCount };
      });
    };

    const handleCommentsUpdated = ({ postId: pid, commentsCount }) => {
      if (sameId(pid))
        setPost((prev) => (prev ? { ...prev, commentsCount } : prev));
    };

    const handlePostDeleted = ({ postId: pid }) => {
      if (sameId(pid)) {
        setPost(null);
        setError("This post was deleted by its author.");
      }
    };

    socket.on("post_shares_updated", handleSharesUpdated);
    socket.on("post_likes_updated", handleLikesUpdated);
    socket.on("post_comments_updated", handleCommentsUpdated);
    socket.on("post_deleted", handlePostDeleted);

    return () => {
      socket.off("post_shares_updated", handleSharesUpdated);
      socket.off("post_likes_updated", handleLikesUpdated);
      socket.off("post_comments_updated", handleCommentsUpdated);
      socket.off("post_deleted", handlePostDeleted);
    };
  }, [socket, post, user]);

  if (loading) {
    return (
      <div className="feed-page">
        <div className="feed-container">
          <div className="feed-loader">
            <div className="spinner-border text-primary"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="feed-page">
        <div className="feed-container">
          <div className="empty-state">
            <i className="bi bi-postcard-heart"></i>
            <p>{error || "This post doesn't exist anymore."}</p>
            <button
              className="btn btn-primary mt-3"
              onClick={() => navigate("/feed")}
            >
              Back to Feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={`Post by ${post.author?.name}`}
        description={post.content?.slice(0, 140)}
        path={`/post/${post._id}`}
      />

      <div className="feed-page">
        <div className="feed-container">
          <button className="post-detail-back" onClick={() => navigate(-1)}>
            <i className="bi bi-arrow-left"></i> Back
          </button>

          <PostCard
            post={post}
            onUpdate={(updated) => {
              if (updated === null) navigate("/feed"); // deleted
              else setPost(updated);
            }}
          />
        </div>
      </div>
    </>
  );
}

export default PostDetail;
