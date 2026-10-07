/**
 * Call audio manager (incoming ringtone + outgoing ringback).
 *
 * SECURITY:
 * - Only local same-origin audio assets are used; never socket-controlled URLs.
 * - No attacker can force the app to load arbitrary audio hosts.
 *
 * BROWSER REALITY:
 * - Autoplay is blocked until a user gesture; we unlock on first interaction and
 *   retry while ringing. disposeCallSounds() tears down global listeners.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const INCOMING_ASSETS = [
  "/sounds/incoming-ringtone.mp3",
  "/sounds/incoming-ringtone.ogg",
  "/sounds/incoming-ringtone.wav",
];

const GESTURE_EVENTS = [
  "pointerdown",
  "touchstart",
  "mousedown",
  "keydown",
  "click",
];

let audioEl = null;
let audioElFailed = false;
let audioCtx = null;
let toneNodes = null;
let toneTimer = null;
let gestureHandler = null;

let unlocked = false;
let activeKind = null; // "incoming" | "outgoing" | null
let pendingKind = null;

const canUseDom = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

function removeGestureListeners() {
  if (!canUseDom() || !gestureHandler) return;
  GESTURE_EVENTS.forEach((ev) => {
    try {
      window.removeEventListener(ev, gestureHandler);
    } catch {}
  });
  gestureHandler = null;
}

// #11 rebuild the element if a previous attempt failed (cached 404 sources).
function ensureAudioElement(force = false) {
  if (!canUseDom()) return null;
  if (audioEl && !force && !audioElFailed) return audioEl;
  try {
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.removeAttribute("src");
        audioEl.load?.();
      } catch {}
    }
    const a = new Audio();
    a.preload = "auto";
    a.loop = true;
    a.volume = 0.9;
    a.muted = false;
    for (const src of INCOMING_ASSETS) {
      const s = document.createElement("source");
      s.src = src;
      if (src.endsWith(".mp3")) s.type = "audio/mpeg";
      else if (src.endsWith(".ogg")) s.type = "audio/ogg";
      else if (src.endsWith(".wav")) s.type = "audio/wav";
      a.appendChild(s);
    }
    a.addEventListener(
      "error",
      () => {
        audioElFailed = true;
      },
      { once: true }
    );
    audioEl = a;
    audioElFailed = false;
    return audioEl;
  } catch {
    audioEl = null;
    return null;
  }
}

function ensureAudioContext() {
  if (!canUseDom()) return null;
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

async function resumeAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx) return false;
  if (ctx.state === "running") return true;
  try {
    await ctx.resume();
  } catch {}
  return ctx.state === "running";
}

function stopTone() {
  if (toneTimer) {
    clearInterval(toneTimer);
    toneTimer = null;
  }
  try {
    toneNodes?.osc?.stop();
  } catch {}
  try {
    toneNodes?.gain?.disconnect();
  } catch {}
  toneNodes = null;
}

// kind-specific pattern: incoming = ring (1s on / 1s off); outgoing = ringback (2s off).
function startTone(kind) {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "running") return false;
  stopTone();
  const period = kind === "outgoing" ? 3000 : 2000;
  const beep = () => {
    if (!ctx || ctx.state !== "running") return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(
        kind === "outgoing" ? 425 : 440,
        ctx.currentTime
      );
      osc.frequency.linearRampToValueAtTime(
        kind === "outgoing" ? 425 : 480,
        ctx.currentTime + 0.15
      );
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1);
      toneNodes = { osc, gain };
    } catch {}
  };
  beep();
  toneTimer = setInterval(beep, period);
  return true;
}

function vibrateIncoming() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate)
      navigator.vibrate([300, 200, 300, 200, 300]);
  } catch {}
}

async function playAudioElement() {
  const a = ensureAudioElement();
  if (!a) return false;
  try {
    a.currentTime = 0;
    a.muted = false;
    a.volume = 0.9;
    await a.play();
    return true;
  } catch {
    if (audioElFailed) ensureAudioElement(true);
    return false;
  }
}

function stopAudioElement() {
  try {
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
  } catch {}
}

export function initCallSoundUnlock() {
  if (!canUseDom() || gestureHandler) return;
  gestureHandler = async () => {
    const ctxOk = await resumeAudioContext();
    const audioOk = await playAudioElement();
    if (audioOk) stopAudioElement();
    if (ctxOk || audioOk) {
      unlocked = true;
      removeGestureListeners();
      if (pendingKind) {
        const k = pendingKind;
        pendingKind = null;
        void internalPlay(k);
      }
    }
  };
  GESTURE_EVENTS.forEach((ev) => {
    try {
      window.addEventListener(ev, gestureHandler, { passive: true });
    } catch {}
  });
}

async function internalPlay(kind) {
  if (activeKind === kind) return true;
  initCallSoundUnlock();

  if (kind === "incoming") {
    const audioOk = await playAudioElement();
    if (audioOk) {
      activeKind = kind;
      pendingKind = null;
      vibrateIncoming();
      return true;
    }
  }
  const toneOk = startTone(kind);
  if (toneOk) {
    activeKind = kind;
    pendingKind = null;
    if (kind === "incoming") vibrateIncoming();
    return true;
  }

  pendingKind = kind; // blocked -> wait for gesture
  return false;
}

export async function playIncomingRingtone() {
  return internalPlay("incoming");
}
export async function playOutgoingRingback() {
  return internalPlay("outgoing");
}

export function stopIncomingRingtone() {
  pendingKind = null;
  if (activeKind === "incoming" || activeKind === null) {
    activeKind = null;
    stopAudioElement();
    stopTone();
  }
}
export function stopOutgoingRingback() {
  pendingKind = null;
  if (activeKind === "outgoing" || activeKind === null) {
    activeKind = null;
    stopAudioElement();
    stopTone();
  }
}

export async function unlockCallSoundsNow() {
  if (!canUseDom()) return false;
  const ctxOk = await resumeAudioContext();
  const audioOk = await playAudioElement();
  if (audioOk) stopAudioElement();
  if (ctxOk || audioOk) {
    unlocked = true;
    removeGestureListeners();
    if (pendingKind) {
      const k = pendingKind;
      pendingKind = null;
      await internalPlay(k);
    }
  }
  return unlocked;
}

export function isCallSoundUnlocked() {
  return unlocked;
}

// #11 full teardown (call on logout) — removes global listeners + resets singletons.
export function disposeCallSounds() {
  stopIncomingRingtone();
  stopOutgoingRingback();
  removeGestureListeners();
  try {
    audioCtx?.close();
  } catch {}
  audioCtx = null;
  try {
    audioEl?.pause();
  } catch {}
  audioEl = null;
  audioElFailed = false;
  unlocked = false;
  activeKind = null;
  pendingKind = null;
}

function useCallRingtoneCore(active, kind) {
  const [blocked, setBlocked] = useState(false);
  const retryRef = useRef(null);

  useEffect(() => {
    initCallSoundUnlock();
  }, []);

  useEffect(() => {
    if (!active) {
      if (kind === "incoming") stopIncomingRingtone();
      else stopOutgoingRingback();
      setBlocked(false);
      if (retryRef.current) {
        clearInterval(retryRef.current);
        retryRef.current = null;
      }
      return;
    }
    let cancelled = false;
    const attempt = async () => {
      const ok =
        kind === "incoming"
          ? await playIncomingRingtone()
          : await playOutgoingRingback();
      if (!cancelled) setBlocked(!ok);
    };
    void attempt();
    retryRef.current = setInterval(() => {
      void attempt();
    }, 1500);
    return () => {
      cancelled = true;
      if (retryRef.current) {
        clearInterval(retryRef.current);
        retryRef.current = null;
      }
      if (kind === "incoming") stopIncomingRingtone();
      else stopOutgoingRingback();
    };
  }, [active, kind]);

  const enable = useCallback(async () => {
    await unlockCallSoundsNow();
    const ok =
      kind === "incoming"
        ? await playIncomingRingtone()
        : await playOutgoingRingback();
    setBlocked(!ok);
  }, [kind]);

  return { blocked, enable };
}

// exported names preserved; outgoing wrapper added (#7).
export function useIncomingCallSound(active) {
  return useCallRingtoneCore(active, "incoming");
}
export function useOutgoingRingback(active) {
  return useCallRingtoneCore(active, "outgoing");
}
