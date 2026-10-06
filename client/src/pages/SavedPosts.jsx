import { useState, useEffect, useCallback } from "react";
import { postService } from "../services/postService";
import PostCard from "../components/PostCard";
import SEO from "../components/SEO";
import Loader from "../components/Loader.jsx";
import { useAlert } from "../context/AlertContext";

/* 🔒 Same defensive normalizer Feed uses, so PostCard can never null-deref a
   saved post and the memo/counter comparisons stay consistent. */
function normalizePost(p) {
  if (!p || typeof p !== "object") return null;
  return {
    ...p,
    _id: p._id ?? `tmp-${Math.random().toString(36).slice(2, 10)}`,
    author:
      p.author && typeof p.author === "object"
        ? p.author
        : { _id: null, name: "Unknown", photos: [] },
    images: Array.isArray(p.images) ? p.images : [],
    likes: Array.isArray(p.likes) ? p.likes : [],
    comments: Array.isArray(p.comments) ? p.comments : [],
    shares: Array.isArray(p.shares) ? p.shares : [],
    reactions: Array.isArray(p.reactions) ? p.reactions : [],
    content: typeof p.content === "string" ? p.content : p.content ?? "",
    createdAt: p.createdAt ?? new Date().toISOString(),
    isLiked: !!p.isLiked,
    isSaved: !!p.isSaved,
    isEdited: !!p.isEdited,
    deletedForEveryone: !!p.deletedForEveryone,
  };
}

function SavedPosts() {
  const toast = useAlert();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSavedPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await postService.getSavedPosts();
      setPosts((res.posts || []).map(normalizePost).filter(Boolean));
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load saved posts.");
      toast.error("Failed to load saved posts", "Error", 4000);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSavedPosts();
  }, [loadSavedPosts]);

  /* ✅ FIX: PostCard passes an UPDATER FUNCTION (or null). The old code stored
     the function as the post, corrupting the card after the first like/comment.
     This now mirrors Feed.handlePostUpdate exactly: invoke, normalize, replace;
     remove only on null (delete, or a confirmed un-save — see PostCard edit #4). */
  const handleUpdate = useCallback((postId, updated) => {
    if (updated === null) {
      setPosts((prev) => prev.filter((p) => p._id !== postId));
      return;
    }
    setPosts((prev) =>
      prev.map((p) => {
        if (p._id !== postId) return p;
        const next = typeof updated === "function" ? updated(p) : updated;
        return normalizePost(next) || p;
      })
    );
  }, []);

  // ═══════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════
  if (loading && posts.length === 0) {
    return (
      <>
        <SEO title="Saved Posts" path="/saved" noIndex />
        <main className="feed-page" id="main-content">
          <div className="feed-container">
            <h2 className="page-title">
              <i className="bi bi-bookmark-fill" aria-hidden="true"></i> Saved
              Posts
            </h2>
            <Loader
              full
              text="Loading your saved posts"
              subtitle="Fetching your favorites"
              icon="bookmark-fill"
            />
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════
  if (error && posts.length === 0) {
    return (
      <>
        <SEO title="Saved Posts" path="/saved" noIndex />
        <main className="feed-page" id="main-content">
          <div className="feed-container">
            <h2 className="page-title">
              <i className="bi bi-bookmark-fill" aria-hidden="true"></i> Saved
              Posts
            </h2>
            <div className="empty-state" role="alert">
              <i
                className="bi bi-exclamation-triangle-fill fs-1 text-danger mb-3"
                aria-hidden="true"
              ></i>
              <h4 className="fw-bold">Failed to load saved posts</h4>
              <p className="text-muted">{error}</p>
              <button
                type="button"
                className="btn btn-primary mt-2"
                onClick={loadSavedPosts}
              >
                <i
                  className="bi bi-arrow-clockwise me-2"
                  aria-hidden="true"
                ></i>
                Try Again
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
        title={`Saved Posts (${posts.length}) — Maya Milan`}
        description="Your saved posts — keep your favorite photos and thoughts in one place."
        path="/saved"
        noIndex
      />

      <main className="feed-page" id="main-content">
        <div className="feed-container">
          <h2 className="page-title">
            <i className="bi bi-bookmark-fill" aria-hidden="true"></i> Saved
            Posts
          </h2>

          {!loading && posts.length === 0 ? (
            <div className="empty-state" role="status">
              <i
                className="bi bi-bookmark fs-1 text-muted mb-3"
                aria-hidden="true"
              ></i>
              <h4 className="fw-bold">No saved posts yet</h4>
              <p className="text-muted">
                Bookmark posts from the feed to see them here.
              </p>
            </div>
          ) : (
            <div role="feed" aria-label="Saved posts">
              {posts.map((post) => (
                <PostCard
                  key={post._id}
                  post={post}
                  onUpdate={(updated) => handleUpdate(post._id, updated)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export default SavedPosts;
