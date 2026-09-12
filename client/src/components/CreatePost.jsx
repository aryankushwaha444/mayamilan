import { useState, useRef } from "react";
import { postService } from "../services/postService";

function CreatePost({ user, onPostCreated }) {
  const [content, setContent] = useState("");
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const userPhoto =
    user?.photos?.find((p) => p.isPrimary)?.url ||
    user?.photos?.[0]?.url ||
    "/images/default-avatar.png";

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 5);
    setImages(files);
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setPreviews(newPreviews);
  };

  const removeImage = (index) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    URL.revokeObjectURL(previews[index]);
    setImages(newImages);
    setPreviews(newPreviews);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && images.length === 0) {
      alert("Write something or add an image");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("content", content.trim());
      images.forEach((img) => formData.append("images", img));

      const res = await postService.createPost(formData);
      onPostCreated(res.post);

      setContent("");
      setImages([]);
      setPreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      alert(err.response?.data?.message || "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="create-post" onSubmit={handleSubmit}>
      <div className="create-post-header">
        <img src={userPhoto} alt="" className="create-post-avatar" />
        <h3>Create a post</h3>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        maxLength={2000}
        rows={4}
      />

      {previews.length > 0 && (
        <div className="image-previews">
          {previews.map((src, i) => (
            <div key={i} className="preview-item">
              <img src={src} alt="" />
              <button type="button" onClick={() => removeImage(i)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="create-post-footer">
        <div className="create-post-tools">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= 5}
          >
            <i className="bi bi-images"></i> Photos ({images.length}/5)
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            multiple
            onChange={handleImageChange}
            hidden
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}

export default CreatePost;