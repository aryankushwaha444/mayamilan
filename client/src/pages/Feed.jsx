import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { postService } from "../services/postService";
import CreatePost from "../components/CreatePost";
import PostCard from "../components/PostCard";
import SEO from "../components/SEO";
import { useSocket } from "../hooks/useSocket.js";
import Loader from "../components/Loader.jsx";
import { useAlert } from "../context/AlertContext";

function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const { socket } = useSocket();
  const toast = useAlert();

  const loadFeed = async (pageNum = 1, append = false) => {
    setLoading(true);
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
    setPosts([newPost, ...posts]);
    toast.success("Post shared with your community !");
  };

  const handleUpdate = (index, updated) => {
    if (updated === null) {
      setPosts(posts.filter((_, i) => i !== index));
    } else {
      setPosts(posts.map((p, i) => (i === index ? updated : p)));
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

          <div className="posts-list">
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

            {posts.map((post, i) => (
              <PostCard
                key={post._id}
                post={post}
                onUpdate={(updated) => handleUpdate(i, updated)}
              />
            ))}

            {loading && !isInitialLoad && (
              <Loader full={false} text="Loading more" icon="arrow-clockwise" />
            )}

            {hasMore && !loading && (
              <button
                className="btn btn-outline-primary w-100"
                onClick={() => loadFeed(page + 1, true)}
              >
                Load More
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default Feed;
