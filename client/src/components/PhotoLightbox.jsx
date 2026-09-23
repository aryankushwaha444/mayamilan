import { useCallback, useEffect, useRef, useState } from "react";
import { fullImg, avatarImg } from "../utils/cloudinary";
import SmartImage from "./SmartImage.jsx";

function PhotoLightbox({ photos, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0); // ✅ NEW: Track Y to prevent swipe on vertical scroll
  const overlayRef = useRef(null);
  const thumbsContainerRef = useRef(null);
  const previousFocusRef = useRef(null);

  const count = photos?.length || 0;

  // ✅ Sync state if parent changes initialIndex while open
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % count);
  }, [count]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + count) % count);
  }, [count]);

  /* KEYBOARD CONTROLS & FOCUS TRAP */
  useEffect(() => {
    // Store previously focused element to restore later
    previousFocusRef.current = document.activeElement;

    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();

      // ✅ Focus Trap: Keep Tab inside the lightbox
      if (e.key === "Tab" && overlayRef.current) {
        const focusableElements = overlayRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKey);

    // Focus the close button initially
    setTimeout(() => {
      const closeBtn = overlayRef.current?.querySelector(".lightbox-close");
      closeBtn?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKey);
      // Restore focus when closed
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [next, prev, onClose]);

  /* LOCK BODY SCROLL WHILE OPEN */
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  /* AUTO-SCROLL THUMBNAILS INTO VIEW */
  useEffect(() => {
    if (thumbsContainerRef.current) {
      const activeThumb = thumbsContainerRef.current.querySelector(".active");
      if (activeThumb) {
        activeThumb.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }, [index]);

  if (!count) return null;

  const getUrl = (p) => (typeof p === "string" ? p : p?.url);
  const currentUrl = getUrl(photos[index]);

  // ✅ Improved Touch Handlers (prevent accidental swipes while scrolling vertically)
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    const diffY = e.changedTouches[0].clientY - touchStartY.current;

    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) prev();
      else next();
    }
  };

  return (
    <div
      className="lightbox-overlay"
      onClick={onClose}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
    >
      {/* Counter */}
      <div className="lightbox-counter" aria-live="polite">
        {index + 1} / {count}
      </div>

      {/* Close */}
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="Close lightbox"
      >
        <i className="bi bi-x-lg" aria-hidden="true"></i>
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
          <i className="bi bi-chevron-left" aria-hidden="true"></i>
        </button>
      )}

      {/* Main image (swipe support) */}
      <SmartImage
        src={fullImg(currentUrl)}
        alt={`Photo ${index + 1} of ${count}`}
        className="lightbox-image"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
          <i className="bi bi-chevron-right" aria-hidden="true"></i>
        </button>
      )}

      {/* Thumbnails */}
      {count > 1 && (
        <div
          className="lightbox-thumbs"
          onClick={(e) => e.stopPropagation()}
          ref={thumbsContainerRef}
          role="tablist"
          aria-label="Photo thumbnails"
        >
          {photos.map((p, i) => (
            <button
              type="button"
              key={i}
              className={`lightbox-thumb ${i === index ? "active" : ""}`}
              onClick={() => setIndex(i)}
              role="tab"
              aria-selected={i === index}
              aria-label={`View photo ${i + 1}`}
            >
              <SmartImage
                src={avatarImg(getUrl(p))}
                alt="" // Empty alt because aria-label is on the button
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PhotoLightbox;
