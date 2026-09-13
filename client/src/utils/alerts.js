import api from "../services/api";

/* =================================================================
   PART 1: IN-APP ALERTS (sound + vibration + system notification)
   ================================================================= */

let audioCtx = null;

// Get or create the shared AudioContext (Safari needs webkit prefix)
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

// 👇 MUST be called synchronously inside a user gesture (click/tap)
export const unlockAudio = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (Safari/Brave start suspended)
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  // Play a silent buffer to fully unlock on Safari
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    console.log("🔊 Audio unlocked, state:", ctx.state);
  } catch {}
};

export const playNotificationSound = async () => {
  const ctx = getAudioContext();
  if (!ctx) {
    playFallbackSound();
    return;
  }

  // Safari/Brave: context may be suspended — resume BEFORE playing
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

    // pleasant "ding-dong"
    tone(880, 0, 0.18);
    tone(660, 0.16, 0.28);
  } catch (e) {
    console.warn("WebAudio failed, using fallback:", e);
    playFallbackSound();
  }
};

// Fallback: HTML <audio> element (works where WebAudio is blocked)
let fallbackAudio = null;
const playFallbackSound = () => {
  try {
    if (!fallbackAudio) {
      // Create a simple beep using Audio element (no file needed)
      fallbackAudio = new Audio();
      fallbackAudio.src =
        "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgipGBc19RZ3+Wn5B1YExZbH+LhHx0gp6QeGBLXG1/j4qAdGBNX26AkIWEf3Z+lp+Qd2BNXW5/kYqFdH90fpafkHZgTV1uf5GKhXR/dH6Wn5B2YE1dbn+RioV0f3R+lp+QdmBNXW5/kYqFdH90fpafkHZgTV1uf5GKhXR/dH6Wn5B2YE1dbn+RioV0fw==";
      fallbackAudio.volume = 0.6;
    }
    fallbackAudio.currentTime = 0;
    fallbackAudio.play().catch(() => {});
  } catch {}
};

export const vibrate = (pattern = [120, 60, 120]) => {
  navigator.vibrate?.(pattern);
};

export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
};

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
      window.location.href = url;
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

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
};

export const subscribeToPush = async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return false;

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
