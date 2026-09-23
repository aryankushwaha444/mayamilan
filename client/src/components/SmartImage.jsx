import { useEffect, useState, memo } from "react";

/**
 * Image with automatic 3-step fallback:
 * 1. Optimized (transformed) URL
 * 2. Original Cloudinary URL (all transformations stripped)
 * 3. Placeholder image
 */
function SmartImage({
  src,
  fallback = "/images/default-avatar.png",
  alt = "",
  loading = "lazy",
  decoding = "async",
  className = "",
  ...rest
}) {
  // ✅ IMPROVED REGEX: Strips ALL Cloudinary transformations between /upload/ and /vXXXX/ or /filename
  // Matches: /upload/c_fill,w_100,h_100,q_auto,f_jpg/v123/... OR /upload/w_100/...
  const getRawUrl = (url) => {
    if (typeof url !== "string") return url;
    return url.replace(/(\/upload\/)(?:[^_/]+_[^,/]*,?)*\//, "$1");
  };

  const rawUrl = getRawUrl(src);
  const [current, setCurrent] = useState(src);
  const [hasFailed, setHasFailed] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setCurrent(src);
    setHasFailed(false);
  }, [src]);

  const handleError = () => {
    if (hasFailed) return; // Prevent infinite loops

    if (current !== rawUrl && rawUrl !== src) {
      // Step 2: Retry original untransformed URL
      setCurrent(rawUrl);
    } else if (current !== fallback) {
      // Step 3: Fallback to placeholder
      setCurrent(fallback);
    } else {
      // Step 4: Even the fallback failed, stop trying
      setHasFailed(true);
    }
  };

  // If even the fallback fails, render a simple SVG icon instead of a broken image
  if (hasFailed) {
    return (
      <div
        className={`smart-image-failed ${className}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f1f3f5",
          color: "#adb5bd",
        }}
        {...rest}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      </div>
    );
  }

  return (
    <img
      {...rest}
      src={current}
      alt={alt}
      onError={handleError}
      loading={loading}
      decoding={decoding}
      className={className}
      key={current} // Forces React to create a new DOM node on fallback
    />
  );
}

export default memo(SmartImage);
