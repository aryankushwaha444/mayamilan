import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { subscribeToPush } from "../utils/alerts";

export function usePushSubscription() {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (
      !loading &&
      isAuthenticated &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    ) {
      // Auto-subscribe every authenticated session
      subscribeToPush().catch((err) => {
        console.warn("Push subscribe failed:", err);
      });
    }
  }, [isAuthenticated, loading]);
}
