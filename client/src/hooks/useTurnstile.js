import { useEffect, useRef, useState, useCallback } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const ENABLED = import.meta.env.VITE_TURNSTILE_ENABLED === "true";

export const useTurnstile = () => {
  const [token, setToken] = useState("");
  const [containerNode, setContainerNode] = useState(null);
  const widgetRef = useRef(null);

  // Load Cloudflare script once
  useEffect(() => {
    if (!ENABLED) return;
    if (document.getElementById("turnstile-script")) return;
    const script = document.createElement("script");
    script.id = "turnstile-script";
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  // ✅ Render WHENEVER the container mounts (fixes step-based forms)
  useEffect(() => {
    if (!ENABLED || !containerNode) return;

    let cancelled = false;

    const render = () => {
      if (cancelled || widgetRef.current) return;
      try {
        widgetRef.current = window.turnstile.render(containerNode, {
          sitekey: SITE_KEY,
          theme: "light",
          callback: (t) => setToken(t),
          "error-callback": () => setToken(""),
          "expired-callback": () => setToken(""),
        });
      } catch (err) {
        console.error("Turnstile render error:", err);
      }
    };

    if (window.turnstile) {
      render();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          render();
        }
      }, 100);
      setTimeout(() => clearInterval(interval), 10000);
    }

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch (e) {}
        widgetRef.current = null;
      }
    };
  }, [containerNode]);

  // ✅ Callback ref — fires when the div mounts/unmounts (any step)
  const containerRef = useCallback((node) => {
    setContainerNode(node);
  }, []);

  const reset = useCallback(() => {
    if (widgetRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetRef.current);
        setToken("");
      } catch (e) {
        console.warn("Turnstile reset failed:", e);
      }
    }
  }, []);

  return { containerRef, token, reset, isEnabled: ENABLED };
};
