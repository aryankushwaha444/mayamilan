import { useEffect, useState } from "react";

function Loader({
  full = true,
  text = "Loading",
  subtitle = "",
  icon = "heart-fill",
  timeout = 30000, // ✅ 30 second timeout
  onTimeout,
  variant = "spinner", // "spinner" | "skeleton" | "dots"
}) {
  const [timedOut, setTimedOut] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // ✅ Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handler = (e) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // ✅ Timeout fallback for stuck loaders
  useEffect(() => {
    if (!full || timeout <= 0) return;

    const timer = setTimeout(() => {
      setTimedOut(true);
      if (onTimeout) onTimeout();
    }, timeout);

    return () => clearTimeout(timer);
  }, [full, timeout, onTimeout]);

  // ✅ Skeleton variant for content loading
  if (variant === "skeleton") {
    return (
      <div
        className="loader-skeleton"
        role="status"
        aria-label="Loading content"
        aria-busy="true"
      >
        <div className="skeleton-line skeleton-title"></div>
        <div className="skeleton-line skeleton-text"></div>
        <div className="skeleton-line skeleton-text short"></div>
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  // ✅ Dots-only variant (minimal)
  if (variant === "dots") {
    return (
      <div
        className="loader-dots-only"
        role="status"
        aria-label={text}
        aria-busy="true"
      >
        <div className={`loader-dots ${reducedMotion ? "no-animation" : ""}`}>
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
        <span className="sr-only">{text}</span>
      </div>
    );
  }

  // ✅ Timed out state
  if (timedOut) {
    return (
      <div
        className={`loader-wrap ${
          full ? "loader-full" : "loader-inline"
        } loader-timeout`}
        role="alert"
        aria-live="assertive"
      >
        <div className="loader-content">
          <div className="loader-icon">
            <i className="bi bi-exclamation-triangle-fill"></i>
          </div>
          <p className="loader-text">Taking longer than expected</p>
          <p className="loader-subtitle">
            Please check your connection and try again
          </p>
          <button
            className="btn btn-sm btn-outline-primary mt-2"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`loader-wrap ${full ? "loader-full" : "loader-inline"}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={text}
    >
      <div className="loader-content">
        {/* ✅ Animated heart icon with reduced motion support */}
        <div className={`loader-icon ${reducedMotion ? "no-animation" : ""}`}>
          <div className="loader-heart-pulse">
            <i className={`bi bi-${icon}`} aria-hidden="true"></i>
          </div>
          {!reducedMotion && (
            <>
              <div className="loader-ring"></div>
              <div className="loader-ring ring-2"></div>
            </>
          )}
        </div>

        {/* ✅ Animated bouncing dots with reduced motion support */}
        <div className={`loader-dots ${reducedMotion ? "no-animation" : ""}`}>
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>

        {/* Text */}
        {full && (
          <>
            <p className="loader-text">{text}</p>
            {subtitle && <p className="loader-subtitle">{subtitle}</p>}
          </>
        )}

        {/* ✅ Screen reader only text for inline loaders */}
        {!full && <span className="sr-only">{text}</span>}
      </div>
    </div>
  );
}

export default Loader;
