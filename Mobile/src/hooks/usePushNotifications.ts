// src/hooks/usePushNotifications.ts
// Owns the OS-level push channel (token lifecycle + tapped-notification routing),
// complementary to useRealtimeAlerts (the in-app socket channel).
//
// DESIGN: this hook does NOT navigate. It exposes the tapped notification's ids to the
// consumer via onNotificationTapped, so the SCREEN decides routing. That keeps the hook
// free of any nested-navigator coupling (the React-Navigation doc's "actions bubble to the
// current navigator first" rule stays the screen's concern, not the data layer's).
//
// SECURITY/ROBUSTNESS: expo-notifications is lazy-required (see lib/notifications); a
// missing native build degrades to no-op + warn, never a red screen. Tap payloads are
// shape-validated (ObjectId ids) before being handed to the consumer.
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../context/AlertContext";
import { isObjectId } from "../utils/media";
import {
  registerForPush,
  unregisterForPush,
  configureForegroundHandler,
  pushEnabled,
} from "../lib/notifications";

// Local structural type = the ONLY contract we rely on from expo-notifications.
// We deliberately do NOT use `typeof import("expo-notifications")`: the package is not
// installed, so it has no .d.ts and naming its type is a compile-time TS2307 even though the
// runtime require below is lazy/guarded. Describing just the members we call keeps this file
// compiling with OR without the native module, and documents the surface we depend on.
export interface PushSubscription {
  remove: () => void;
}
export interface NotificationsLike {
  getPermissionsAsync?: () => Promise<{ granted?: boolean }>;
  requestPermissionsAsync?: () => Promise<{ granted?: boolean }>;
  getExpoPushTokenAsync?: (opts?: unknown) => Promise<{ data?: string }>;
  setNotificationHandler?: (handler: unknown) => void;
  getLastNotificationResponseAsync?: () => Promise<unknown>;
  addNotificationResponseReceivedListener?: (
    cb: (r: unknown) => void
  ) => PushSubscription;
  addNotificationReceivedListener?: (
    cb: (n: unknown) => void
  ) => PushSubscription;
}

let Notifications: NotificationsLike | null = null;
try {
  // lazy: never a top-level import (would crash if the native module isn't in the build)
  Notifications = require("expo-notifications") as NotificationsLike;
} catch {
  Notifications = null;
}

export interface TappedNotification {
  type?: string;
  entityId?: string;
  conversationId?: string;
  actorId?: string;
}

export function usePushNotifications(options?: {
  onNotificationTapped?: (n: TappedNotification) => void;
}) {
  const { isAuthenticated } = useAuth();
  const toast = useAlert();
  const tappedRef = useRef(options?.onNotificationTapped);
  useEffect(() => {
    tappedRef.current = options?.onNotificationTapped;
  }, [options?.onNotificationTapped]);

  // register the token while authenticated; tear it down on logout
  useEffect(() => {
    if (!isAuthenticated || !pushEnabled()) return;
    let cancelled = false;
    configureForegroundHandler();
    registerForPush().then((t) => {
      if (cancelled) return;
      if (t) console.log("[push] registered"); // token itself never logged
    });
    return () => {
      cancelled = true;
      void unregisterForPush();
    };
  }, [isAuthenticated]);

  // route a tapped / received-while-foreground notification to the consumer (validated)
  useEffect(() => {
    if (!Notifications) return;
    const extract = (n: any): TappedNotification | null => {
      const data =
        n?.request?.content?.data ?? n?.content?.data ?? n?.data ?? {};
      const out: TappedNotification = {};
      if (typeof data.type === "string") out.type = data.type;
      if (isObjectId(data.entityId)) out.entityId = data.entityId;
      if (isObjectId(data.conversationId))
        out.conversationId = data.conversationId;
      if (isObjectId(data.actorId)) out.actorId = data.actorId;
      return Object.keys(out).length ? out : null;
    };

    const subs: Array<{ remove: () => void }> = [];
    try {
      // tapped while app was backgrounded/closed
      const resp = Notifications.getLastNotificationResponseAsync?.();
      resp
        ?.then?.((r: any) => {
          const t = extract(r);
          if (t) tappedRef.current?.(t);
        })
        ?.catch?.(() => {});

      const s1 = Notifications.addNotificationResponseReceivedListener?.(
        (r: any) => {
          const t = extract(r);
          if (t) tappedRef.current?.(t);
        }
      );
      if (s1) subs.push(s1);

      // received while foreground (also surfaced as a toast so the user sees it in-app)
      const s2 = Notifications.addNotificationReceivedListener?.((n: any) => {
        const title = n?.request?.content?.title ?? n?.title;
        const body = n?.request?.content?.body ?? n?.body;
        if (title || body)
          toast.info([title, body].filter(Boolean).join(" — "));
        const t = extract(n);
        if (t) tappedRef.current?.(t);
      });
      if (s2) subs.push(s2);
    } catch (err) {
      console.warn("[push] listener setup failed (ignored):", err);
    }

    return () => {
      subs.forEach((s) => {
        try {
          s.remove();
        } catch {}
      });
    };
  }, [toast]);

  return { enabled: pushEnabled() };
}

export default usePushNotifications;
