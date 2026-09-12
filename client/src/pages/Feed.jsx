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

// 👇 MOVED OUTSIDE: Prevents re-creation on every render (Virtuoso optimization)
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

  useEffect(() => {
    if (!socket) return;

    const handleSharesUpdated = ({ postId, sharesCount }) => {
      setPosts((prev) =>
        prev.map((p) => (p._id === postId ? { ...p, sharesCount } : p))
      );
    };

    socket.on("post_shares_updated", handleSharesUpdated);
    return () => socket.off("post_shares_updated", handleSharesUpdated);
  }, [socket]);

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
