import api from "../utils/api";

/* =================================================================
   PART 1: IN-APP ALERTS (sound + vibration + system notification)
   ================================================================= */

let audioCtx = null;
let userHasInteracted = false;
let interactionListenerAttached = false; // ✅ Track listener state

// ✅ Track user interaction to satisfy browser autoplay policies
if (typeof document !== "undefined" && !interactionListenerAttached) {
  const handleInteraction = () => {
    userHasInteracted = true;

    // If an AudioContext was somehow created, resume it
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    // Remove listeners once we know the user has interacted
    document.removeEventListener("click", handleInteraction);
    document.removeEventListener("touchstart", handleInteraction);
    document.removeEventListener("keydown", handleInteraction);
    interactionListenerAttached = false;
  };

  document.addEventListener("click", handleInteraction, { once: true });
  document.addEventListener("touchstart", handleInteraction, { once: true });
  document.addEventListener("keydown", handleInteraction, { once: true });

  interactionListenerAttached = true;
}

// ✅ Track user interaction to satisfy browser autoplay policies
if (typeof document !== "undefined") {
  const handleInteraction = () => {
    userHasInteracted = true;

    // If an AudioContext was somehow created, resume it
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    // Remove listeners once we know the user has interacted
    document.removeEventListener("click", handleInteraction);
    document.removeEventListener("touchstart", handleInteraction);
    document.removeEventListener("keydown", handleInteraction);
  };

  document.addEventListener("click", handleInteraction);
  document.addEventListener("touchstart", handleInteraction);
  document.addEventListener("keydown", handleInteraction);
}

/**
 * Get or create the shared AudioContext.
 * ✅ CRITICAL FIX: Returns null if user hasn't interacted yet.
 * Instantiating `new AudioContext()` before a user gesture triggers the Chrome warning.
 */
const getAudioContext = () => {
  if (typeof window === "undefined") return null;

  // 🛑 STOP: Do not create AudioContext until user interacts with the page
  if (!userHasInteracted) return null;

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
 * Manual unlock (can be attached to a specific button click if needed)
 */
export const unlockAudio = () => {
  userHasInteracted = true;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

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
 */
export const playNotificationSound = async () => {
  // 🛑 STOP: Don't play anything if user hasn't interacted yet.
  if (!userHasInteracted) return;

  const ctx = getAudioContext();
  if (!ctx) {
    playFallbackSound();
    return;
  }

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
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

const FALLBACK_BEEP_BASE64 =
  "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgICA";

let fallbackAudio = null;

const playFallbackSound = () => {
  if (!userHasInteracted) return;

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
 */
export const vibrate = (pattern = [120, 60, 120]) => {
  navigator.vibrate?.(pattern);
};

/**
 * Request browser notification permission
 */
export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
};

/**
 * Show a system notification.
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
      try {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.location.href = url;
      }
      n.close();
    };
  } catch {
    navigator.serviceWorker?.ready?.then((reg) =>
      reg.showNotification(title, options)
    );
  }
};

/* =================================================================
   PART 2: WEB PUSH SUBSCRIPTION (works when browser is closed)
   ================================================================= */

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
};

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
