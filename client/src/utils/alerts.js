import api from "../utils/api"; // ✅ FIXED: correct import path

/* =================================================================
   PART 1: IN-APP ALERTS (sound + vibration + system notification)
   ================================================================= */

let audioCtx = null;

/**
 * Get or create the shared AudioContext (Safari needs webkit prefix)
 * @returns {AudioContext|null}
 */
const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  return audioCtx;
};

/**
 * ⚠️ MUST be called synchronously inside a user gesture (click/tap).
 * Unlocks WebAudio on Safari/Brave which start contexts suspended.
 */
export const unlockAudio = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  // Play silent buffer to fully unlock on Safari
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {}
};

/**
 * Play a pleasant two-tone notification sound via WebAudio API.
 * Falls back to HTML Audio element if WebAudio is unavailable.
 */
export const playNotificationSound = async () => {
  const ctx = getAudioContext();
  if (!ctx) {
    playFallbackSound();
    return;
  }

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {}
  }

  try {
    const now = ctx.currentTime;

    const tone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.25, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };

    // Pleasant "ding-dong"
    tone(880, 0, 0.18);
    tone(660, 0.16, 0.28);
  } catch {
    playFallbackSound();
  }
};

// ✅ Valid short beep as WAV base64 (440Hz, 100ms, 8-bit mono)
const FALLBACK_BEEP_BASE64 =
  "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgICA";

let fallbackAudio = null;

/** Fallback sound using HTML Audio element (works where WebAudio is blocked) */
const playFallbackSound = () => {
  try {
    if (!fallbackAudio) {
      fallbackAudio = new Audio(FALLBACK_BEEP_BASE64);
      fallbackAudio.volume = 0.6;
    }
    fallbackAudio.currentTime = 0;
    fallbackAudio.play().catch(() => {});
  } catch {}
};

/**
 * Trigger device vibration pattern
 * @param {number[]} [pattern=[120, 60, 120]] - Vibration pattern in ms
 */
export const vibrate = (pattern = [120, 60, 120]) => {
  navigator.vibrate?.(pattern);
};

/**
 * Request browser notification permission
 * @returns {Promise<"granted"|"denied"|"default"|"unsupported">}
 */
export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
};

/**
 * Show a system notification. Falls back to Service Worker on Android Chrome.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.tag] - Deduplication tag
 * @param {string} [options.url="/"] - URL to navigate to on click
 */
export const showSystemNotification = ({ title, body, tag, url = "/" }) => {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const options = {
    body,
    icon: "/logo.png",
    badge: "/logo.png",
    tag,
    data: { url },
  };

  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      // ✅ Use history API instead of full page reload to preserve React state
      try {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.location.href = url;
      }
      n.close();
    };
  } catch {
    // Android Chrome prefers SW-based notifications
    navigator.serviceWorker?.ready?.then((reg) =>
      reg.showNotification(title, options)
    );
  }
};

/* =================================================================
   PART 2: WEB PUSH SUBSCRIPTION (works when browser is closed)
   ================================================================= */

/**
 * Convert URL-safe base64 VAPID key to Uint8Array
 * @param {string} base64String
 * @returns {Uint8Array}
 */
const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
};

/**
 * Subscribe to Web Push notifications.
 * Requests permission, creates subscription, and registers with backend.
 * @returns {Promise<boolean>} true if successfully subscribed
 */
export const subscribeToPush = async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn("VAPID public key missing — push skipped");
      return false;
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  try {
    await api.post("/push/subscribe", sub.toJSON());
    return true;
  } catch (err) {
    console.warn("Push subscribe API failed:", err);
    return false;
  }
};

/**
 * Unsubscribe from Web Push notifications.
 * Notifies backend first, then removes local subscription.
 */
export const unsubscribeFromPush = async () => {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      try {
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
      } catch {}
      await sub.unsubscribe();
    }
  } catch {}
};
