import { useState, useRef, useEffect, useCallback } from "react";
import { postService } from "../services/postService";
import { compressPostPhoto } from "../utils/imageCompressor";
import { useAlert } from "../context/AlertContext";
import { avatarImg } from "../utils/cloudinary";
import ConfirmDialog from "./ConfirmDialog.jsx";

// ✅ Constants
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
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const previewsRef = useRef([]); // ✅ Track previews for cleanup

  const userPhoto =
    user?.photos?.find((p) => p.isPrimary)?.url ||
    user?.photos?.[0]?.url ||
    "/images/default-avatar.png";

  const firstName = user?.name?.split(" ")[0] || "there";

  // ✅ FIXED: Cleanup only on unmount, not every render
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Auto-focus textarea when expanded
  useEffect(() => {
    if (expanded) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [expanded]);

  // ✅ Shared image handling logic
  const processFiles = useCallback(
    async (filesToAdd) => {
      if (filesToAdd.length === 0) return;

      // Check total count
      if (images.length + filesToAdd.length > MAX_IMAGES) {
        toast.warning(`Maximum ${MAX_IMAGES} photos allowed`);
        return;
      }

      // Filter by size
      const validFiles = filesToAdd.filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          toast.warning(`${f.name} exceeds ${MAX_FILE_SIZE_MB}MB`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      // Create previews
      const newPreviews = validFiles.map((f) => URL.createObjectURL(f));
      previewsRef.current = [...previewsRef.current, ...newPreviews];

      const newImages = [...images, ...validFiles].slice(0, MAX_IMAGES);
      const allPreviews = [...previews, ...newPreviews].slice(0, MAX_IMAGES);

      setImages(newImages);
      setPreviews(allPreviews);
    },
    [images, previews, toast]
  );

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    processFiles(files);
    e.target.value = "";
  };

  // ✅ NEW: Drag and drop support
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );
    processFiles(files);
  };

  // ✅ NEW: Paste image support
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      await processFiles(imageFiles);
    }
  };

  const removeImage = (index) => {
    URL.revokeObjectURL(previews[index]);
    previewsRef.current = previewsRef.current.filter((_, i) => i !== index);

    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
  };

  const clearImages = () => {
    previews.forEach((url) => URL.revokeObjectURL(url));
    previewsRef.current = [];
    setImages([]);
    setPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (content.trim() || images.length > 0) {
      setShowDiscardConfirm(true);
    } else {
      setExpanded(false);
    }
  };

  const confirmDiscard = () => {
    setContent("");
    clearImages();
    setExpanded(false);
    setShowDiscardConfirm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content.trim() && images.length === 0) {
      toast.warning("Write something or add an image");
      return;
    }

    setSubmitting(true);
    setCompressing(true);
    setCompressionProgress(0);

    try {
      const formData = new FormData();
      formData.append("content", content.trim());

      if (images.length > 0) {
        toast.info(
          `Optimizing ${images.length} photo${images.length > 1 ? "s" : ""}...`,
          "Compressing",
          2500
        );

        const compressedImages = [];
        for (let i = 0; i < images.length; i++) {
          try {
            const compressed = await compressPostPhoto(images[i]);
            compressedImages.push(compressed);
            setCompressionProgress(Math.round(((i + 1) / images.length) * 100));
          } catch (err) {
            console.warn(
              `Compression failed for ${images[i].name}, using original`
            );
            compressedImages.push(images[i]);
            setCompressionProgress(Math.round(((i + 1) / images.length) * 100));
          }
        }

        compressedImages.forEach((file) => formData.append("images", file));
      }

      setCompressing(false);

      const res = await postService.createPost(formData);
      onPostCreated(res.post);

      setContent("");
      clearImages();
      setExpanded(false);

      toast.success("Post shared! 🎉");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to create post");
    } finally {
      setSubmitting(false);
      setCompressing(false);
      setCompressionProgress(0);
    }
  };

  // ✅ Keyboard shortcut: Ctrl+Enter to post
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!isDisabled && (content.trim() || images.length > 0)) {
        handleSubmit(e);
      }
    }
  };

  const isDisabled = submitting || compressing;
  const charCount = content.length;
  const charLimitReached = charCount >= MAX_CONTENT_LENGTH;

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
        <form
          className={`create-post-expanded ${dragOver ? "drag-over" : ""}`}
          onSubmit={handleSubmit}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
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

          {/* ✅ Drag overlay */}
          {dragOver && (
            <div className="drag-overlay" aria-hidden="true">
              <i className="bi bi-cloud-upload"></i>
              <span>Drop images here</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`What's on your mind, ${firstName}?`}
            maxLength={MAX_CONTENT_LENGTH}
            rows={3}
            disabled={isDisabled}
            aria-label="Post content"
          />

          {/* ✅ Character counter */}
          {charCount > MAX_CONTENT_LENGTH * 0.8 && (
            <div className={`char-counter ${charLimitReached ? "limit" : ""}`}>
              {charCount}/{MAX_CONTENT_LENGTH}
            </div>
          )}

          {/* ✅ Compression progress */}
          {compressing && images.length > 0 && (
            <div className="compression-progress" aria-live="polite">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${compressionProgress}%` }}
                ></div>
              </div>
              <small>Compressing {compressionProgress}%</small>
            </div>
          )}

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
                title="Ctrl+Enter to post"
              >
                {compressing
                  ? `Optimizing ${compressionProgress}%...`
                  : submitting
                  ? "Posting..."
                  : "Post"}
              </button>
            </div>
          </div>
        </form>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        onChange={handleImageChange}
        hidden
      />

      {/* ✅ Replace window.confirm with ConfirmDialog */}
      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard post?"
        message="Your post content and photos will be lost."
        confirmText="Discard"
        cancelText="Keep editing"
        danger
        icon="bi-trash-fill"
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={confirmDiscard}
      />
    </div>
  );
}

export default CreatePost;
