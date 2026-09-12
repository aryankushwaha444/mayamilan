import { useState, useEffect } from "react";
import { postService } from "../services/postService";
import PostCard from "../components/PostCard";
import SEO from "../components/SEO";
import Loader from "../components/Loader.jsx";
import { useAlert } from "../context/AlertContext"; // 👈 ADD for error toasts

function SavedPosts() {
  const toast = useAlert(); // 👈 ADD
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await postService.getSavedPosts();
        setPosts(res.posts);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load saved posts"); // 👈 ADD error toast
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUpdate = (index, updated) => {
    if (updated === null) {
      setPosts(posts.filter((_, i) => i !== index));
    } else {
      // if unsaved, remove from saved page
      if (!updated.isSaved) {
        setPosts(posts.filter((_, i) => i !== index));
      } else {
        setPosts(posts.map((p, i) => (i === index ? updated : p)));
      }
    }
  };

  return (
    <>
      <SEO
        title="Saved Posts"
        description="Your saved posts — keep your favorite photos and thoughts in one place."
        path="/saved"
      />

      <div className="feed-page">
        <div className="feed-container">
          <h2 className="page-title">
            <i className="bi bi-bookmark-fill"></i> Saved Posts
          </h2>

          {/* 👇 BRANDED LOADER — replaces generic spinner */}
          {loading && posts.length === 0 && (
            <Loader
              full
              text="Loading your saved posts"
              subtitle="Fetching your favorites"
              icon="bookmark-fill"
            />
          )}

          {!loading && posts.length === 0 && (
            <div className="empty-state">
              <i className="bi bi-bookmark"></i>
              <p>
                No saved posts yet. Bookmark posts from the feed to see them
                here.
              </p>
            </div>
          )}

          {posts.map((post, i) => (
            <PostCard
              key={post._id}
              post={post}
              onUpdate={(updated) => handleUpdate(i, updated)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default SavedPosts;
