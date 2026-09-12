import { useCallback, useEffect, useRef, useState } from "react";
import { fullImg, avatarImg } from "../utils/cloudinary";
import SmartImage from "./SmartImage.jsx";

function PhotoLightbox({ photos, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef(0);

  const count = photos?.length || 0;

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % count);
  }, [count]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  /* KEYBOARD CONTROLS (Esc / ← / →) */
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onClose]);

  /* LOCK BODY SCROLL WHILE OPEN */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!count) return null;

  const getUrl = (p) => (typeof p === "string" ? p : p?.url);
  const currentUrl = getUrl(photos[index]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      {/* Counter */}
      <div className="lightbox-counter">
        {index + 1} / {count}
      </div>

      {/* Close */}
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="Close"
      >
        <i className="bi bi-x-lg"></i>
      </button>

      {/* Prev */}
      {count > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Previous photo"
        >
          <i className="bi bi-chevron-left"></i>
        </button>
      )}

      {/* Main image (swipe support) — FIXED: uses currentUrl instead of currentPhoto */}
      <SmartImage
        src={fullImg(currentUrl)}
        alt={`Photo ${index + 1}`}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const diff = e.changedTouches[0].clientX - touchStartX.current;
          if (diff > 50) prev();
          if (diff < -50) next();
        }}
      />

      {/* Next */}
      {count > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-next"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Next photo"
        >
          <i className="bi bi-chevron-right"></i>
        </button>
      )}

      {/* Thumbnails — optimized with avatarImg for tiny previews */}
      {count > 1 && (
        <div className="lightbox-thumbs" onClick={(e) => e.stopPropagation()}>
          {photos.map((p, i) => (
            <button
              type="button"
              key={i}
              className={`lightbox-thumb ${i === index ? "active" : ""}`}
              onClick={() => setIndex(i)}
            >
              <SmartImage src={avatarImg(getUrl(p))} alt={`Thumb ${i + 1}`} />{" "}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PhotoLightbox;
