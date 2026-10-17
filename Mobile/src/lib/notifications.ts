// src/lib/notifications.ts
// Bridge between the (possibly-absent) native push layer and the FILLED api/notifications.
// SECURITY/ROBUSTNESS:
//  - expo-notifications is reached ONLY via lazy require() -> a missing/stale native build
//    degrades to a no-op + warn, never a red screen (the ExponentAV lesson).
//  - the token is validated as a non-empty string BEFORE it ever hits the backend, and the
//    backend route (api/notifications.registerPushToken) re-validates + pins platform.
//  - no secret is logged; the token is a device credential, treated as sensitive.
import { Platform } from "react-native";
import {
  registerPushToken as apiRegisterPushToken,
  unregisterPushToken as apiUnregisterPushToken,
} from "../api/notifications";

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

const PLATFORM: "ios" | "android" =
  Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "ios";

let currentToken: string | null = null;

/** Ask the OS for permission, fetch the Expo push token, and persist it server-side.
 *  Returns the token on success, null if push is unavailable (no crash). */
export async function registerForPush(): Promise<string | null> {
  if (!Notifications) {
    console.warn(
      "[push] expo-notifications not available; skipping registration."
    );
    return null;
  }
  try {
    const settings = await Notifications.getPermissionsAsync?.();
    let granted = settings?.granted;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync?.();
      granted = req?.granted;
    }
    if (!granted) {
      console.warn("[push] user denied notification permission.");
      return null;
    }

    // getExpoPushTokenAsync needs projectId on EAS/managed builds; guard so a missing
    // config degrades instead of throwing.
    const projectId = (Notifications as any).getExpoPushTokenAsync
      ? undefined
      : undefined;
    const tokenResp = await Notifications.getExpoPushTokenAsync?.(
      projectId ? { projectId } : undefined
    );
    const token = tokenResp?.data;

    if (typeof token !== "string" || token.trim().length === 0) {
      console.warn("[push] empty push token from OS; not registering.");
      return null;
    }

    await apiRegisterPushToken(token, PLATFORM); // backend re-validates token + platform
    currentToken = token;
    return token;
  } catch (err) {
    console.warn("[push] registration failed (degraded, no crash):", err);
    return null;
  }
}

/** Best-effort remove this device's token from the server (e.g. on logout). */
export async function unregisterForPush(): Promise<void> {
  const token = currentToken;
  currentToken = null;
  if (!token) return;
  try {
    await apiUnregisterPushToken(token);
  } catch (err) {
    console.warn("[push] unregistration failed (ignored):", err);
  }
}

/** Foreground presentation policy. Modern expo-notifications keys (shouldShowBanner/List)
 *  with legacy shouldShowAlert fallback, all inside the lazy module so a missing build no-ops. */
export function configureForegroundHandler(): void {
  if (!Notifications?.setNotificationHandler) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // new API
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        // legacy API (older expo-notifications) — harmless extra keys on new versions
        shouldShowAlert: true as any,
      }),
    });
  } catch (err) {
    console.warn("[push] foreground handler setup failed (ignored):", err);
  }
}

export const pushEnabled = (): boolean => !!Notifications;
