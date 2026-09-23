import { useEffect, useRef, useState, useCallback } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const ENABLED = import.meta.env.VITE_TURNSTILE_ENABLED === "true";
const SCRIPT_LOAD_TIMEOUT = 15000; // 15 seconds max wait for script

export const useTurnstile = () => {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error | expired
  const [containerNode, setContainerNode] = useState(null);
  const widgetRef = useRef(null);
  const pollingRef = useRef(null);

  // ✅ Load Cloudflare script once with proper onload tracking
  useEffect(() => {
    if (!ENABLED) return;
    if (document.getElementById("turnstile-script")) return;

    setStatus("loading");

    const script = document.createElement("script");
    script.id = "turnstile-script";
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setStatus("ready");
    };

    script.onerror = () => {
      console.error("Failed to load Turnstile script");
      setStatus("error");
    };

    document.body.appendChild(script);
  }, []);

  // ✅ Render widget whenever container mounts (supports step-based forms)
  useEffect(() => {
    if (!ENABLED || !containerNode) return;

    let cancelled = false;

    const renderWidget = () => {
      if (cancelled) return;

      // ✅ Always remove previous widget before rendering new one
      if (widgetRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch {}
        widgetRef.current = null;
      }

      try {
        widgetRef.current = window.turnstile.render(containerNode, {
          sitekey: SITE_KEY,
          theme: "light",
          callback: (t) => {
            if (!cancelled) {
              setToken(t);
              setStatus("ready");
            }
          },
          "error-callback": (err) => {
            if (!cancelled) {
              console.error("Turnstile error:", err);
              setToken("");
              setStatus("error");
            }
          },
          "expired-callback": () => {
            if (!cancelled) {
              setToken("");
              setStatus("expired");
            }
          },
        });
      } catch (err) {
        console.error("Turnstile render error:", err);
        if (!cancelled) setStatus("error");
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // ✅ Poll with proper cleanup and timeout
      pollingRef.current = setInterval(() => {
        if (window.turnstile) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          renderWidget();
        }
      }, 100);

      // Timeout: stop polling and report error
      const timeoutId = setTimeout(() => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        if (!cancelled && !window.turnstile) {
          console.error("Turnstile script failed to load within timeout");
          setStatus("error");
        }
      }, SCRIPT_LOAD_TIMEOUT);

      // Cleanup timeout on unmount
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        if (widgetRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetRef.current);
          } catch {}
          widgetRef.current = null;
        }
      };
    }

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch {}
        widgetRef.current = null;
      }
    };
  }, [containerNode]);

  // ✅ Callback ref — fires when div mounts/unmounts (any step)
  const containerRef = useCallback((node) => {
    setContainerNode(node);
  }, []);

  // ✅ Reset with status tracking
  const reset = useCallback(() => {
    if (widgetRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetRef.current);
        setToken("");
        setStatus("ready");
      } catch (e) {
        console.warn("Turnstile reset failed:", e);
        setStatus("error");
      }
    }
  }, []);

  // ✅ Validate token is still valid before form submit
  const isValid = useCallback(() => {
    if (!ENABLED) return true;
    if (!widgetRef.current || !window.turnstile) return false;
    try {
      const response = window.turnstile.getResponse(widgetRef.current);
      return !!response;
    } catch {
      return false;
    }
  }, []);

  return {
    containerRef,
    token,
    status, // ✅ NEW: "idle" | "loading" | "ready" | "error" | "expired"
    reset,
    isValid, // ✅ NEW: validate before submit
    isEnabled: ENABLED,
  };
};
