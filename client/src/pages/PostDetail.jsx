import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { postService } from "../services/postService.js";
import PostCard from "../components/PostCard.jsx";
import SEO from "../components/SEO.jsx";
import { useSocket } from "../hooks/useSocket.js";

function PostDetail() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !post) return;

    const handleSharesUpdated = ({ postId, sharesCount }) => {
      if (postId === post._id) {
        setPost((prev) => ({ ...prev, sharesCount }));
      }
    };

    socket.on("post_shares_updated", handleSharesUpdated);
    return () => socket.off("post_shares_updated", handleSharesUpdated);
  }, [socket, post]);

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
