import { useState, useEffect, useRef, useCallback, Component } from "react";
import { useAuth } from "../hooks/useAuth";
import { postService } from "../services/postService";
import CreatePost from "../components/CreatePost";
import PostCard from "../components/PostCard";
import SEO from "../components/SEO";
import { useSocket } from "../hooks/useSocket.js";
import Loader from "../components/Loader.jsx";
import { useAlert } from "../context/AlertContext";
import { Virtuoso } from "react-virtuoso";

/* 🔒 Guarantee a safe shape so PostCard can never null-deref a post field.
   Spreads the original first, so unknown keys PostCard relies on are preserved. */
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

/* 🔒 Inner boundary: one bad post can no longer take down the whole shell/navbar. */
class ListErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // This is the line that names the EXACT file+line of the real bug.
    console.error("Feed list render error:", error, info?.componentStack);
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state" role="alert">
          <i
            className="bi bi-exclamation-triangle-fill fs-1 text-warning mb-3"
            aria-hidden="true"
          ></i>
          <h4>Couldn't display part of the feed</h4>
          <p className="text-muted">
            A post failed to render. Your navigation is safe.
          </p>
          <button className="btn btn-primary mt-2" onClick={this.props.onRetry}>
            <i className="bi bi-arrow-clockwise me-2" aria-hidden="true"></i>Try
            Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Feed Footer ─── */
function FeedFooter({ loadingMore, hasMore, postsCount }) {
  if (loadingMore) {
    return (
      <div className="feed-footer-loading">
        <Loader full={false} text="Loading more" icon="arrow-clockwise" />
      </div>
    );
  }
  if (!hasMore && postsCount > 0) {
    return (
      <div className="feed-footer-end" role="status">
        <i className="bi bi-check-circle me-2" aria-hidden="true"></i>
        You've seen all posts!
      </div>
    );
  }
  return null;
}

/* ─── Main Feed Component ─── */
function Feed() {
  const { user } = useAuth();
  const toast = useAlert();
  const { socket } = useSocket();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listResetKey, setListResetKey] = useState(0); // 🔒

  const virtuosoRef = useRef(null);
  const userRef = useRef(user);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const loadFeed = useCallback(
    async (pageNum = 1, append = false) => {
      if (append) {
        if (loadingMoreRef.current) return;
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError("");
      }

      try {
        const res = await postService.getFeed(pageNum);

        if (append) {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p._id));
            // 🔒 normalize + drop nulls before they reach PostCard
            const newPosts = (res.posts || [])
              .map(normalizePost)
              .filter(Boolean)
              .filter((p) => !existingIds.has(p._id));
            return [...prev, ...newPosts];
          });
        } else {
          // 🔒 normalize + drop nulls
          setPosts((res.posts || []).map(normalizePost).filter(Boolean));
        }

        setHasMore(res.pagination?.hasNextPage ?? false);
        setPage(pageNum);
      } catch (err) {
        console.error("Load feed error:", err);
        if (!append) {
          setError(
            err.response?.status === 429
              ? "Too many requests. Please wait a moment and retry."
              : err.response?.data?.message || "Failed to load feed"
          );
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadFeed(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleSharesUpdated = ({ postId, sharesCount }) => {
      const count = Number(sharesCount);
      if (!Number.isFinite(count) || count < 0) return;

      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, sharesCount: count } : p))
      );
    };

    const handleLikesUpdated = ({ postId, likesCount }) => {
      const count = Number(likesCount);
      if (!Number.isFinite(count) || count < 0) return;

      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, likesCount: count } : p))
      );
    };

    const handleCommentsUpdated = ({ postId, commentsCount }) => {
      const count = Number(commentsCount);
      if (!Number.isFinite(count) || count < 0) return;

      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, commentsCount: count } : p))
      );
    };

    const handleNewPost = ({ post }) => {
      const np = normalizePost(post);
      if (!np) return;

      setPosts((prev) => {
        if (prev.some((p) => p._id === np._id)) return prev;
        return [np, ...prev];
      });
    };

    const handlePostDeleted = ({ postId }) => {
      setPosts((prev) => prev.filter((p) => p._id !== postId));
    };

    socket.on("post_shares_updated", handleSharesUpdated);
    socket.on("post_likes_updated", handleLikesUpdated);
    socket.on("post_comments_updated", handleCommentsUpdated);
    socket.on("new_post", handleNewPost);
    socket.on("post_deleted", handlePostDeleted);

    return () => {
      socket.off("post_shares_updated", handleSharesUpdated);
      socket.off("post_likes_updated", handleLikesUpdated);
      socket.off("post_comments_updated", handleCommentsUpdated);
      socket.off("new_post", handleNewPost);
      socket.off("post_deleted", handlePostDeleted);
    };
  }, [socket]);

  const handlePostUpdate = useCallback((postId, updated) => {
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

  const handlePostCreated = useCallback(
    (newPost) => {
      // 🔒 normalize newly created post
      const np = normalizePost(newPost);
      if (!np) return;
      setPosts((prev) => {
        if (prev.some((p) => p._id === np._id)) return prev;
        return [np, ...prev];
      });
      toast.success("Post shared with your community! 🎉", "Posted", 3000);
      virtuosoRef.current?.scrollToIndex({ index: 0, behavior: "smooth" });
    },
    [toast]
  );

  const loadMore = useCallback(() => {
    if (!loadingMoreRef.current && hasMoreRef.current) {
      loadFeed(pageRef.current + 1, true);
    }
  }, [loadFeed]);

  const handleRetry = useCallback(() => {
    setListResetKey((k) => k + 1); // 🔒 reset the inner boundary
    loadFeed(1);
  }, [loadFeed]);

  const isInitialLoad = loading && posts.length === 0;

  return (
    <>
      <SEO
        title="Feed — See What the Community is Sharing"
        description="Browse posts, photos and thoughts from Maya Milan members. Like, comment and save your favorites."
        path="/feed"
        type="article"
      />

      <main className="feed-page" id="main-content">
        <div className="feed-container">
          <CreatePost user={user} onPostCreated={handlePostCreated} />

          {isInitialLoad && (
            <Loader
              full
              text="Loading your feed"
              subtitle="Fetching latest posts"
              icon="house-door-fill"
            />
          )}

          {error && posts.length === 0 && !loading && (
            <div className="empty-state" role="alert">
              <i
                className="bi bi-exclamation-triangle-fill fs-1 text-danger mb-3"
                aria-hidden="true"
              ></i>
              <h4>Failed to load feed</h4>
              <p className="text-muted">{error}</p>
              <button className="btn btn-primary mt-2" onClick={handleRetry}>
                <i
                  className="bi bi-arrow-clockwise me-2"
                  aria-hidden="true"
                ></i>
                Try Again
              </button>
            </div>
          )}

          {posts.length === 0 && !loading && !error && (
            <div className="empty-state" role="status">
              <i
                className="bi bi-inbox fs-1 text-muted mb-3"
                aria-hidden="true"
              ></i>
              <h4>No posts yet</h4>
              <p className="text-muted">Be the first to share something!</p>
            </div>
          )}

          {/* 🔒 Inner boundary wraps ONLY the list → navbar/shell survive a bad post */}
          {posts.length > 0 && (
            <ListErrorBoundary resetKey={listResetKey} onRetry={handleRetry}>
              <div role="feed" aria-label="Community feed">
                <Virtuoso
                  ref={virtuosoRef}
                  useWindowScroll
                  data={posts}
                  endReached={loadMore}
                  overscan={400}
                  computeItemKey={(_, post) => post._id}
                  itemContent={(index, post) => (
                    <div className="feed-item-wrapper">
                      <PostCard
                        post={post}
                        onUpdate={(updated) =>
                          handlePostUpdate(post._id, updated)
                        }
                      />
                    </div>
                  )}
                  components={{
                    Footer: () => (
                      <FeedFooter
                        loadingMore={loadingMore}
                        hasMore={hasMore}
                        postsCount={posts.length}
                      />
                    ),
                  }}
                />
              </div>
            </ListErrorBoundary>
          )}
        </div>
      </main>
    </>
  );
}

export default Feed;
