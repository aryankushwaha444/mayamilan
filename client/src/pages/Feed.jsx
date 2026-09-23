import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { postService } from "../services/postService";
import CreatePost from "../components/CreatePost";
import PostCard from "../components/PostCard";
import SEO from "../components/SEO";
import { useSocket } from "../hooks/useSocket.js";
import Loader from "../components/Loader.jsx";
import { useAlert } from "../context/AlertContext";
import { Virtuoso } from "react-virtuoso";

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

  const virtuosoRef = useRef(null);
  // ✅ Refs for socket handlers — avoid stale closures without re-subscribing
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

  // ✅ Stable load function
  const loadFeed = useCallback(
    async (pageNum = 1, append = false) => {
      if (append) {
        if (loadingMoreRef.current) return; // Prevent double-fetch
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError("");
      }

      try {
        const res = await postService.getFeed(pageNum);

        if (append) {
          setPosts((prev) => {
            // Deduplicate by _id
            const existingIds = new Set(prev.map((p) => p._id));
            const newPosts = (res.posts || []).filter(
              (p) => !existingIds.has(p._id)
            );
            return [...prev, ...newPosts];
          });
        } else {
          setPosts(res.posts || []);
        }

        setHasMore(res.pagination?.hasNextPage ?? false);
        setPage(pageNum);
      } catch (err) {
        console.error("Load feed error:", err);
        if (!append) {
          setError(err.response?.data?.message || "Failed to load feed");
        }
        toast.error("Failed to load feed", "Error", 4000);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [toast]
  );

  // ✅ Initial load
  useEffect(() => {
    loadFeed(1);
  }, [loadFeed]);

  // ✅ REAL-TIME SYNC — uses refs, never stale
  useEffect(() => {
    if (!socket) return;

    let placeholderCounter = 0; // ✅ Unique counter instead of Date.now()

    const handleSharesUpdated = ({ postId, sharesCount }) => {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, sharesCount } : p))
      );
    };

    const handleLikesUpdated = ({ postId, likesCount }) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p._id !== postId) return p;

          const arr = Array.isArray(p.likes) ? [...p.likes] : [];
          if (arr.length === likesCount) return { ...p, likesCount };

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

          return { ...p, likes: arr, likesCount };
        })
      );
    };

    const handleCommentsUpdated = ({ postId, commentsCount }) => {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, commentsCount } : p))
      );
    };

    // ✅ Handle new posts from followed users in real-time
    const handleNewPost = ({ post }) => {
      if (!post) return;
      setPosts((prev) => {
        if (prev.some((p) => p._id === post._id)) return prev;
        return [post, ...prev];
      });
    };

    // ✅ Handle deleted posts
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
  }, [socket]); // ✅ Only depends on socket — reads user/page/etc from refs

  // ✅ Use post._id for updates instead of array index
  const handlePostUpdate = useCallback((postId, updated) => {
    if (updated === null) {
      setPosts((prev) => prev.filter((p) => p._id !== postId));
    } else {
      setPosts((prev) => prev.map((p) => (p._id === postId ? updated : p)));
    }
  }, []);

  const handlePostCreated = useCallback(
    (newPost) => {
      setPosts((prev) => {
        if (prev.some((p) => p._id === newPost._id)) return prev;
        return [newPost, ...prev];
      });
      toast.success("Post shared with your community! 🎉", "Posted", 3000);

      // ✅ Scroll Virtuoso to top instead of window.scrollTo
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

          {/* Initial Loading */}
          {isInitialLoad && (
            <Loader
              full
              text="Loading your feed"
              subtitle="Fetching latest posts"
              icon="house-door-fill"
            />
          )}

          {/* Error State */}
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

          {/* Empty State */}
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

          {/* Virtualized Feed */}
          {posts.length > 0 && (
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
          )}
        </div>
      </main>
    </>
  );
}

export default Feed;
