import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { postService } from "../services/postService";
import CreatePost from "../components/CreatePost";
import PostCard from "../components/PostCard";
import SEO from "../components/SEO";
import { useSocket } from "../hooks/useSocket.js";
import Loader from "../components/Loader.jsx";
import { useAlert } from "../context/AlertContext";
import { Virtuoso } from "react-virtuoso";

const FeedFooter = ({ loadingMore, hasMore, postsCount }) => {
  if (loadingMore) {
    return (
      <div style={{ padding: "30px", textAlign: "center" }}>
        <Loader full={false} text="Loading more" icon="arrow-clockwise" />
      </div>
    );
  }
  if (!hasMore && postsCount > 0) {
    return (
      <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>
        <i className="bi bi-check-circle me-2"></i>
        You've seen all posts!
      </div>
    );
  }
  return null;
};

function Feed() {
  const { user } = useAuth();
  const toast = useAlert();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { socket } = useSocket();
  const virtuosoRef = useRef(null);

  const loadFeed = async (pageNum = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await postService.getFeed(pageNum);
      if (append) {
        setPosts((prev) => [...prev, ...res.posts]);
      } else {
        setPosts(res.posts);
      }
      setHasMore(res.pagination.hasNextPage);
      setPage(pageNum);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load feed");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // ✅ REAL-TIME SYNC — SAFE: never destroys the likes array
  useEffect(() => {
    if (!socket) return;

    // Shares (was already working — unchanged)
    const handleSharesUpdated = ({ postId, sharesCount }) => {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, sharesCount } : p))
      );
    };

    // ✅ LIKES: keep the array intact, only sync its LENGTH to the server count.
    // PostCard's toggle logic (likes.includes / likes.length) keeps working perfectly.
    const handleLikesUpdated = ({ postId, likesCount }) => {
      setPosts((prev) =>
        prev.map((p) => {
          if (p._id !== postId) return p;

          const arr = Array.isArray(p.likes) ? [...p.likes] : [];
          if (arr.length === likesCount) {
            return { ...p, likesCount };
          }

          const me = user?._id ? String(user._id) : null;

          if (arr.length < likesCount) {
            // Someone else liked → grow array with placeholder ids (display-only)
            while (arr.length < likesCount) {
              arr.push(`sync_${arr.length}_${Date.now()}`);
            }
          } else {
            // Someone unliked → shrink, but NEVER remove MY OWN like id
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

    // ✅ COMMENTS: commentsCount is a plain number on the post — safe to set directly
    const handleCommentsUpdated = ({ postId, commentsCount }) => {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, commentsCount } : p))
      );
    };

    socket.on("post_shares_updated", handleSharesUpdated);
    socket.on("post_likes_updated", handleLikesUpdated);
    socket.on("post_comments_updated", handleCommentsUpdated);

    return () => {
      socket.off("post_shares_updated", handleSharesUpdated);
      socket.off("post_likes_updated", handleLikesUpdated);
      socket.off("post_comments_updated", handleCommentsUpdated);
    };
  }, [socket, user]);

  useEffect(() => {
    loadFeed(1);
  }, []);

  const handlePostCreated = (newPost) => {
    setPosts((prev) => [newPost, ...prev]);
    toast.success("Post shared with your community! 🎉");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUpdate = (index, updated) => {
    if (updated === null) {
      setPosts((prev) => prev.filter((_, i) => i !== index));
    } else {
      setPosts((prev) => prev.map((p, i) => (i === index ? updated : p)));
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadFeed(page + 1, true);
    }
  };

  const isInitialLoad = loading && posts.length === 0;

  return (
    <>
      <SEO
        title="Feed — See What the Community is Sharing"
        description="Browse posts, photos and thoughts from Maya Milan members. Like, comment and save your favorites."
        path="/feed"
      />

      <div className="feed-page">
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

          {posts.length === 0 && !loading && (
            <div className="empty-state">
              <i className="bi bi-inbox"></i>
              <p>No posts yet. Be the first to share something!</p>
            </div>
          )}

          {posts.length > 0 && (
            <Virtuoso
              ref={virtuosoRef}
              useWindowScroll
              data={posts}
              endReached={loadMore}
              overscan={400}
              computeItemKey={(index, post) => post._id}
              itemContent={(index, post) => (
                <div style={{ paddingBottom: "16px" }}>
                  <PostCard
                    post={post}
                    onUpdate={(updated) => handleUpdate(index, updated)}
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
          )}
        </div>
      </div>
    </>
  );
}

export default Feed;
