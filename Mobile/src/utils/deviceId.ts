// src/utils/deviceId.ts — stable, non-PII device id.
// SECURITY POSTURE: the id is generated LOCALLY (no attacker input ever flows in),
// is non-secret, and is unguessable-enough for server-side anti-abuse/throttling.
// Robustness: every native module (expo-secure-store / expo-device / expo-crypto)
// is reached via LAZY require() inside try/catch with a memory fallback, so a stale
// or missing native build degrades gracefully instead of crashing the app
// (the exact ExponentAV / ExponentImagePicker lesson from this migration).
// NOTE: does NOT import getItem/setItem from ../lib/secureStore — that module
// exposes a token-only API (saveToken/getToken/clearToken); generic KV lives here.

const KEY = "mm_device_id";
let memo: string | null = null; // session cache: stable even if storage is unavailable

function fallbackId(): string {
  // Not a secret; only needs to be unguessable-enough for throttling.
  return "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- lazy, crash-proof persistence (mirrors secureStore's own pattern) ---
async function readStored(key: string): Promise<string | null> {
  try {
    const SS = require("expo-secure-store"); // lazy: never a top-level import
    const v = await SS.getItemAsync(key);
    return typeof v === "string" && v.length ? v : null;
  } catch {
    return null; // native missing / web / locked -> caller falls back to memo/id
  }
}
async function writeStored(key: string, val: string): Promise<void> {
  try {
    const SS = require("expo-secure-store");
    await SS.setItemAsync(key, val);
  } catch {
    /* best-effort; memo already holds the value for this session */
  }
}

export async function getDeviceId(): Promise<string> {
  if (memo) return memo;

  const stored = await readStored(KEY);
  if (stored) {
    memo = stored;
    return stored;
  }

  let id = fallbackId();
  try {
    const Device = require("expo-device"); // lazy
    const Crypto = require("expo-crypto"); // lazy
    if (Device?.isDevice && Crypto?.getRandomBytesAsync) {
      // Pin to Uint8Array so Array.from yields number[] (fixes TS2345:
      // Array.from over `any` would otherwise infer unknown[]).
      const bytes: Uint8Array = await Crypto.getRandomBytesAsync(16);
      id =
        "dev_" +
        Array.from(bytes)
          .map((b: number) => b.toString(16).padStart(2, "0"))
          .join("");
    }
  } catch {
    /* keep fallback id */
  }

  await writeStored(KEY, id);
  memo = id;
  return id;
}
