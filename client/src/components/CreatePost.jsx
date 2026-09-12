import { useState, useRef, useEffect } from "react";
import { postService } from "../services/postService";
import { compressPostPhoto } from "../utils/imageCompressor";
import { useAlert } from "../context/AlertContext";
import { avatarImg } from "../utils/cloudinary";

function CreatePost({ user, onPostCreated }) {
  const toast = useAlert();

  const [content, setContent] = useState("");
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false); // 👈 NEW: collapsed vs expanded

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const userPhoto =
    user?.photos?.find((p) => p.isPrimary)?.url ||
    user?.photos?.[0]?.url ||
    "/images/default-avatar.png";

  const firstName = user?.name?.split(" ")[0] || "there"; // 👈 "What's on your mind, Aryan?"

  // Auto-focus textarea when composer expands
  useEffect(() => {
    if (expanded) textareaRef.current?.focus();
  }, [expanded]);

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
      toast.warning("Write something or add an image");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("content", content.trim());

      if (images.length > 0) {
        toast.info(
          `Optimizing ${images.length} photo${images.length > 1 ? "s" : ""}...`,
          "Compressing",
          2500
        );
        const compressedImages = await Promise.all(
          images.map((file) => compressPostPhoto(file))
        );
        compressedImages.forEach((file) => formData.append("images", file));
      }

      const res = await postService.createPost(formData);
      onPostCreated(res.post);

      setContent("");
      setImages([]);
      setPreviews([]);
      setExpanded(false); // 👈 collapse again after posting
      if (fileInputRef.current) fileInputRef.current.value = "";

      toast.success("Post shared! 🎉");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-post">
      {/* ============ COLLAPSED: Facebook-style pill row ============ */}
      {!expanded ? (
        <div className="create-post-collapsed">
          <img
            src={avatarImg(userPhoto)}
            alt=""
            className="create-post-avatar"
          />

          <button
            type="button"
            className="create-post-fake-input"
            onClick={() => setExpanded(true)}
          >
            What's on your mind, {firstName}?
          </button>

          <button
            type="button"
            className="create-post-icon-btn icon-photo"
            title="Add photos"
            onClick={() => {
              setExpanded(true);
              setTimeout(() => fileInputRef.current?.click(), 100);
            }}
          >
            <i className="bi bi-image-fill"></i>
          </button>
        </div>
      ) : (
        /* ============ EXPANDED: full composer ============ */
        <form className="create-post-expanded" onSubmit={handleSubmit}>
          <div className="create-post-header">
            <img
              src={avatarImg(userPhoto)}
              alt=""
              className="create-post-avatar"
            />
            <strong className="create-post-name">{user?.name}</strong>

            <button
              type="button"
              className="create-post-close"
              onClick={() => setExpanded(false)}
              title="Close"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`What's on your mind, ${firstName}?`}
            maxLength={2000}
            rows={3}
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
                title="Add photos"
              >
                <i className="bi bi-image-fill"></i> Photos ({images.length}/5)
              </button>
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setExpanded(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  submitting || (!content.trim() && images.length === 0)
                }
              >
                {submitting ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Hidden file input (shared by both states) */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        onChange={handleImageChange}
        hidden
      />
    </div>
  );
}

export default CreatePost;
