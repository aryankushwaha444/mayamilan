import { useEffect, useState } from "react";

/**
 * Image with automatic 3-step fallback:
 * 1. Optimized (transformed) URL
 * 2. Original Cloudinary URL (transformations stripped)
 * 3. Placeholder image
 */
export default function SmartImage({
  src,
  fallback = "/images/default-avatar.png",
  alt = "",
  ...rest
}) {
  // Strip transformations: /upload/w_100,h_100,.../v123/x.jpg → /upload/v123/x.jpg
  const rawUrl =
    typeof src === "string"
      ? src.replace(/(\/upload\/)(?:w_[^/]*\/)/, "$1")
      : src;

  const [current, setCurrent] = useState(src);

  useEffect(() => {
    setCurrent(src);
  }, [src]);

  const handleError = () => {
    if (current !== rawUrl) {
      setCurrent(rawUrl); // step 2: retry original
    } else if (current !== fallback) {
      setCurrent(fallback); // step 3: placeholder
    }
  };

  return <img {...rest} src={current} alt={alt} onError={handleError} />;
}
