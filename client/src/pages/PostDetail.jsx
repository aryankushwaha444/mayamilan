import { useEffect, useState, useRef } from "react";
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

  // ✅ Refs for socket handlers — avoid stale closures without re-subscribing
  const postRef = useRef(null);
  const userRef = useRef(user);

  useEffect(() => {
    postRef.current = post;
  }, [post]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // ✅ Load post with cancellation
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

        const status = err.response?.status;
        if (status === 404) {
          setError("This post doesn't exist anymore.");
        } else if (status === 401) {
          setError("Your session expired. Please log in again.");
        } else {
          setError(err.response?.data?.message || "Failed to load post.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPost();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // ✅ Real-time sync — uses refs, only depends on socket
  useEffect(() => {
    if (!socket) return;

    let placeholderCounter = 0; // ✅ Unique counter instead of Date.now()

    const handleSharesUpdated = ({ postId: pid, sharesCount }) => {
      const current = postRef.current;
      if (!current || pid !== current._id) return;
      setPost((prev) => (prev ? { ...prev, sharesCount } : prev));
    };

    const handleLikesUpdated = ({ postId: pid, likesCount }) => {
      const current = postRef.current;
      if (!current || pid !== current._id) return;

      setPost((prev) => {
        if (!prev) return prev;
        const arr = Array.isArray(prev.likes) ? [...prev.likes] : [];
        if (arr.length === likesCount) return { ...prev, likesCount };

        const me = userRef.current?._id ? String(userRef.current._id) : null;

        if (arr.length < likesCount) {
          while (arr.length < likesCount) {
            placeholderCounter++;
            arr.push(`sync_${placeholderCounter}`);
          }
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
      const current = postRef.current;
      if (!current || pid !== current._id) return;
      setPost((prev) => (prev ? { ...prev, commentsCount } : prev));
    };

    const handlePostDeleted = ({ postId: pid }) => {
      const current = postRef.current;
      if (!current || pid !== current._id) return;
      setPost(null);
      setError("This post was deleted by its author.");
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
  }, [socket]); // ✅ Only depends on socket — no re-subscription on post/user changes

  // ✅ Safe back navigation — stays within app
  const handleBack = () => {
    if (
      window.history.length > 2 &&
      document.referrer.includes(window.location.origin)
    ) {
      navigate(-1);
    } else {
      navigate("/feed");
    }
  };

  // ✅ Sanitize content for SEO description
  const seoDescription = post?.content
    ? post.content.replace(/<[^>]*>/g, "").slice(0, 160)
    : "View this post on Maya Milan";

  // ═══════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════
  if (loading) {
    return (
      <>
        <SEO title="Loading Post..." path={`/post/${postId}`} noIndex />
        <main className="feed-page" id="main-content">
          <div className="feed-container">
            <div className="feed-loader" role="status">
              <div className="spinner-border text-primary"></div>
              <span className="visually-hidden">Loading post...</span>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // ERROR / NOT FOUND STATE
  // ═══════════════════════════════════════
  if (error || !post) {
    return (
      <>
        <SEO title="Post Not Found" path={`/post/${postId}`} noIndex />
        <main className="feed-page" id="main-content">
          <div className="feed-container">
            <div className="empty-state" role="alert">
              <i
                className="bi bi-postcard-heart fs-1 text-muted mb-3"
                aria-hidden="true"
              ></i>
              <h2 className="h5 fw-bold">Post Unavailable</h2>
              <p className="text-muted">
                {error || "This post doesn't exist anymore."}
              </p>
              <button
                type="button"
                className="btn btn-primary mt-3"
                onClick={handleBack}
              >
                <i className="bi bi-arrow-left me-2" aria-hidden="true"></i>
                Back to Feed
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // MAIN VIEW
  // ═══════════════════════════════════════
  return (
    <>
      <SEO
        title={`Post by ${post.author?.name || "Unknown"} — Maya Milan`}
        description={seoDescription}
        path={`/post/${post._id}`}
        type="article"
        schema={{
          "@context": "https://schema.org",
          "@type": "SocialMediaPosting",
          headline: seoDescription,
          datePublished: post.createdAt,
          dateModified: post.updatedAt || post.createdAt,
          author: {
            "@type": "Person",
            name: post.author?.name || "Unknown",
          },
          interactionStatistic: [
            {
              "@type": "InteractionCounter",
              interactionType: "LikeAction",
              userInteractionCount: post.likesCount || post.likes?.length || 0,
            },
            {
              "@type": "InteractionCounter",
              interactionType: "CommentAction",
              userInteractionCount: post.commentsCount || 0,
            },
            {
              "@type": "InteractionCounter",
              interactionType: "ShareAction",
              userInteractionCount: post.sharesCount || 0,
            },
          ],
        }}
      />

      <main className="feed-page" id="main-content">
        <div className="feed-container">
          <button
            type="button"
            className="post-detail-back"
            onClick={handleBack}
            aria-label="Go back"
          >
            <i className="bi bi-arrow-left" aria-hidden="true"></i> Back
          </button>

          <PostCard
            post={post}
            onUpdate={(updated) => {
              if (updated === null) navigate("/feed");
              else setPost(updated);
            }}
          />
        </div>
      </main>
    </>
  );
}

export default PostDetail;
