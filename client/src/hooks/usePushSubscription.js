import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { subscribeToPush, unsubscribeFromPush } from "../utils/alerts";

export function usePushSubscription() {
  const { isAuthenticated, loading } = useAuth();
  const subscribedRef = useRef(false);

  // ✅ Subscribe when authenticated + permission granted
  useEffect(() => {
    let cancelled = false;

    const trySubscribe = async () => {
      // Guard: already subscribed this session
      if (subscribedRef.current) return;

      // Guard: feature detection
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        return;
      }

      // Guard: permission not granted
      if (Notification.permission !== "granted") return;

      try {
        await subscribeToPush();
        if (!cancelled) {
          subscribedRef.current = true;
          console.log("✅ Push subscription active");
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Push subscribe failed:", err);
          // ✅ Retry once after 5 seconds for transient failures
          setTimeout(() => {
            if (!cancelled && !subscribedRef.current) {
              trySubscribe();
            }
          }, 5000);
        }
      }
    };

    if (!loading && isAuthenticated) {
      trySubscribe();
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loading]);

  // ✅ Listen for permission changes (user grants permission mid-session)
  useEffect(() => {
    if (!("permissions" in navigator)) return;

    let permissionStatus = null;
    let cancelled = false;

    const handlePermissionChange = () => {
      if (
        !cancelled &&
        permissionStatus?.state === "granted" &&
        isAuthenticated &&
        !loading
      ) {
        subscribedRef.current = false; // Reset so subscribe effect runs
      }
    };

    try {
      permissionStatus = navigator.permissions.query({ name: "notifications" });

      // ✅ Cross-browser: use onchange property (works everywhere)
      // addEventListener is NOT supported on PermissionStatus in Safari/Firefox
      permissionStatus.onchange = handlePermissionChange;
    } catch {
      // permissions API not supported or query failed — ignore silently
    }

    return () => {
      cancelled = true;
      if (permissionStatus) {
        permissionStatus.onchange = null; // ✅ Safe cleanup
      }
    };
  }, [isAuthenticated, loading]);

  // ✅ Unsubscribe on logout / unmount while unauthenticated
  useEffect(() => {
    if (!loading && !isAuthenticated && subscribedRef.current) {
      unsubscribeFromPush().catch((err) => {
        console.warn("Push unsubscribe failed:", err);
      });
      subscribedRef.current = false;
    }
  }, [isAuthenticated, loading]);
}
