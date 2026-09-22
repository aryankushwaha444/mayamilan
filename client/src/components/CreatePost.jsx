import { useState, useRef, useEffect } from "react";
import { postService } from "../services/postService";
import { compressPostPhoto } from "../utils/imageCompressor";
import { useAlert } from "../context/AlertContext";
import { avatarImg } from "../utils/cloudinary";

// ✅ UX-only constants (backend has authoritative limits)
const MAX_IMAGES = 5;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_CONTENT_LENGTH = 2000;

function CreatePost({ user, onPostCreated }) {
  const toast = useAlert();

  const [content, setContent] = useState("");
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const userPhoto =
    user?.photos?.find((p) => p.isPrimary)?.url ||
    user?.photos?.[0]?.url ||
    "/images/default-avatar.png";

  const firstName = user?.name?.split(" ")[0] || "there";

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  // Auto-focus textarea when expanded
  useEffect(() => {
    if (expanded) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [expanded]);

  // ✅ UX-ONLY validation (backend does security validation)
  const handleImageChange = (e) => {
    let files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Check total count (UX feedback)
    if (images.length + files.length > MAX_IMAGES) {
      toast.warning(`Maximum ${MAX_IMAGES} photos allowed`);
      e.target.value = "";
      return;
    }

    // Basic size check (save bandwidth - backend also checks)
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      toast.warning(`${oversized.length} file(s) exceed ${MAX_FILE_SIZE_MB}MB`);
      files = files.filter((f) => f.size <= MAX_FILE_SIZE);
    }

    if (files.length === 0) {
      e.target.value = "";
      return;
    }

    // Add files (backend will do security validation)
    const newImages = [...images, ...files].slice(0, MAX_IMAGES);
    const newPreviews = [
      ...previews,
      ...files.map((f) => URL.createObjectURL(f)),
    ];

    setImages(newImages);
    setPreviews(newPreviews);
    e.target.value = "";
  };

  const removeImage = (index) => {
    URL.revokeObjectURL(previews[index]);
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
  };

  const clearImages = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setImages([]);
    setPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (content.trim() || images.length > 0) {
      if (window.confirm("Discard your post?")) {
        setContent("");
        clearImages();
        setExpanded(false);
      }
    } else {
      setExpanded(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content.trim() && images.length === 0) {
      toast.warning("Write something or add an image");
      return;
    }

    setSubmitting(true);
    setCompressing(true);

    try {
      const formData = new FormData();
      formData.append("content", content.trim());

      if (images.length > 0) {
        toast.info(
          `Optimizing ${images.length} photo${images.length > 1 ? "s" : ""}...`,
          "Compressing",
          2500
        );

        // Compress (best effort - fallback to original on error)
        const compressedImages = [];
        for (const image of images) {
          try {
            const compressed = await compressPostPhoto(image);
            compressedImages.push(compressed);
          } catch (err) {
            console.warn(
              `Compression failed for ${image.name}, using original`
            );
            compressedImages.push(image);
          }
        }

        compressedImages.forEach((file) => formData.append("images", file));
      }

      setCompressing(false);

      // Backend does all security validation
      const res = await postService.createPost(formData);
      onPostCreated(res.post);

      setContent("");
      clearImages();
      setExpanded(false);

      toast.success("Post shared! 🎉");
    } catch (err) {
      console.error(err);
      // Show backend error message
      toast.error(err.response?.data?.message || "Failed to create post");
    } finally {
      setSubmitting(false);
      setCompressing(false);
    }
  };

  const isDisabled = submitting || compressing;

  return (
    <div className="create-post">
      {!expanded ? (
        <div className="create-post-collapsed">
          <img
            src={avatarImg(userPhoto)}
            alt=""
            className="create-post-avatar"
            aria-hidden="true"
          />

          <button
            type="button"
            className="create-post-fake-input"
            onClick={() => setExpanded(true)}
            aria-label="Create a post"
          >
            What's on your mind, {firstName}?
          </button>

          <button
            type="button"
            className="create-post-icon-btn icon-photo"
            title="Add photos"
            aria-label="Add photos to post"
            onClick={() => {
              setExpanded(true);
              setTimeout(() => fileInputRef.current?.click(), 150);
            }}
          >
            <i className="bi bi-image-fill" aria-hidden="true"></i>
          </button>
        </div>
      ) : (
        <form className="create-post-expanded" onSubmit={handleSubmit}>
          <div className="create-post-header">
            <img
              src={avatarImg(userPhoto)}
              alt=""
              className="create-post-avatar"
              aria-hidden="true"
            />
            <strong className="create-post-name">{user?.name}</strong>

            <button
              type="button"
              className="create-post-close"
              onClick={handleClose}
              title="Close"
              aria-label="Close composer"
              disabled={isDisabled}
            >
              <i className="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`What's on your mind, ${firstName}?`}
            maxLength={MAX_CONTENT_LENGTH}
            rows={3}
            disabled={isDisabled}
            aria-label="Post content"
          />

          {previews.length > 0 && (
            <div className="image-previews" role="list">
              {previews.map((src, i) => (
                <div key={i} className="preview-item" role="listitem">
                  <img src={src} alt={`Preview ${i + 1}`} />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    disabled={isDisabled}
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <i className="bi bi-x-lg" aria-hidden="true"></i>
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
                disabled={isDisabled || images.length >= MAX_IMAGES}
                title="Add photos"
                aria-label={`Add photos. ${images.length} of ${MAX_IMAGES} selected`}
              >
                <i className="bi bi-image-fill" aria-hidden="true"></i>
                <span>
                  Photos ({images.length}/{MAX_IMAGES})
                </span>
              </button>

              {images.length > 0 && (
                <button
                  type="button"
                  onClick={clearImages}
                  disabled={isDisabled}
                  title="Clear all photos"
                  aria-label="Clear all photos"
                >
                  <i className="bi bi-trash" aria-hidden="true"></i>
                </button>
              )}
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-light"
                onClick={handleClose}
                disabled={isDisabled}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  isDisabled || (!content.trim() && images.length === 0)
                }
              >
                {compressing
                  ? "Optimizing..."
                  : submitting
                  ? "Posting..."
                  : "Post"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ✅ Accept all images - backend validates */}
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
