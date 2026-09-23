import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    // 1. If there's a hash, let the browser handle scrolling to the anchor
    if (hash) {
      // Small timeout to ensure the DOM element exists before scrolling
      setTimeout(() => {
        const element = document.getElementById(hash.replace("#", ""));
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 0);
      return;
    }

    // 2. Only scroll to top if the actual page path changed, not just query params
    // This preserves scroll position if you're just filtering/sorting on the same page
    if (previousPathname.current !== pathname) {
      // Use 'auto' for instant scroll (standard compliant)
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      previousPathname.current = pathname;
    }
  }, [pathname, hash]);

  return null;
}

export default ScrollToTop;
