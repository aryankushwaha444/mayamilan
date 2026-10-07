/**
 * WebRTC security helpers.
 *
 * Purpose:
 * - Treat all socket-delivered signaling data as untrusted.
 * - Prevent malformed SDP/candidate/ICE-server payloads from destabilizing WebRTC.
 * - Enforce strict URL schemes for ICE servers (+ optional host allowlist).
 * - Cap sizes (total AND per-line) to reduce memory/CPU/parser abuse.
 */

const MAX_ICE_SERVERS = 10;
const MAX_URLS_PER_SERVER = 5;
const MAX_URL_LEN = 300;
const MAX_USERNAME_LEN = 256;
const MAX_CREDENTIAL_LEN = 512;
const MAX_CANDIDATE_LEN = 1000;
const MAX_SDP_LEN = 100_000;
const MAX_SDP_LINE_LEN = 2000; // #9 per-line cap
const MAX_PEER_ID_LEN = 128;
const MAX_PEER_NAME_LEN = 80;
const MAX_PEER_PHOTO_LEN = 1000;
const MAX_CALL_ID_LEN = 128;
const MAX_ERROR_MESSAGE_LEN = 200;

export const MAX_PENDING_CANDIDATES = 100;

const ICE_URL_RE = /^(stuns?:|turns?:)[^\s]+$/i;
const ICE_HOST_RE = /^(?:stuns?|turns?):\/\/([^:?\/]+)/i; // #8 host extraction
const CALL_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // excludes \t \n \r

// #8 optional allowlist (hostnames). When unset, permissive (server is the
// trusted source of iceServers); when set, NON-matching hosts are dropped.
const TRUSTED_ICE_HOSTS = (() => {
  try {
    const raw = import.meta.env?.VITE_TRUSTED_ICE_HOSTS;
    if (!raw || typeof raw !== "string") return null;
    const set = new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    return set.size ? set : null;
  } catch {
    return null;
  }
})();

const cleanString = (v, max) =>
  typeof v === "string"
    ? v.replace(CONTROL_CHARS_RE, "").trim().slice(0, max)
    : "";

const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;

export const isWebRtcDebugEnabled = () => {
  try {
    if (import.meta.env?.DEV === true) return true;
  } catch {}
  try {
    return globalThis.localStorage?.getItem("MAYA_DEBUG_WEBRTC") === "1";
  } catch {
    return false;
  }
};

export const sanitizeCallId = (v) => {
  if (!isNonEmptyString(v)) return null;
  const id = v.replace(CONTROL_CHARS_RE, "").trim().slice(0, MAX_CALL_ID_LEN);
  if (!CALL_ID_RE.test(id)) return null;
  return id;
};

export const sanitizeIceServers = (input) => {
  if (!Array.isArray(input)) return [];

  const out = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    const rawUrls = Array.isArray(item.urls)
      ? item.urls
      : typeof item.url === "string"
      ? [item.url]
      : [];

    const urls = [];

    for (const u of rawUrls) {
      const s = cleanString(u, MAX_URL_LEN);
      if (!s) continue;
      if (!ICE_URL_RE.test(s)) continue;

      // #8 host allowlist (defense-in-depth against a hostile/buggy relay).
      if (TRUSTED_ICE_HOSTS) {
        const m = s.match(ICE_HOST_RE);
        const host = (m?.[1] || "").toLowerCase();
        if (!host || !TRUSTED_ICE_HOSTS.has(host)) continue;
      }

      urls.push(s);
      if (urls.length >= MAX_URLS_PER_SERVER) break;
    }

    if (urls.length === 0) continue;

    const server = { urls };

    // #8 STUN carries no auth; keeping username/credential on a stun: URL is a
    // confusion vector. Only turn:/turns: may hold credentials.
    const isTurn = urls.some((u) => /^turns?:/i.test(u));

    if (isTurn) {
      const username = cleanString(item.username, MAX_USERNAME_LEN);
      const credential = cleanString(item.credential, MAX_CREDENTIAL_LEN);
      if (username) server.username = username;
      if (credential) server.credential = credential;
      if (item.credentialType === "oauth") server.credentialType = "oauth";
    }

    out.push(server);
    if (out.length >= MAX_ICE_SERVERS) break;
  }

  return out;
};

export const sanitizeIceCandidate = (input) => {
  if (!input || typeof input !== "object") return null;

  const rawCandidate =
    typeof input.candidate === "string" ? input.candidate : "";

  const candidate = rawCandidate
    .replace(CONTROL_CHARS_RE, "")
    .trim()
    .slice(0, MAX_CANDIDATE_LEN);

  // Empty candidate is valid for end-of-candidates signaling.
  if (candidate.length > 0 && !/^candidate:/i.test(candidate)) {
    return null;
  }

  let sdpMid = null;
  if (typeof input.sdpMid === "string") {
    sdpMid = input.sdpMid.replace(CONTROL_CHARS_RE, "").slice(0, 64);
  } else if (input.sdpMid != null) {
    return null;
  }

  let sdpMLineIndex = null;
  if (input.sdpMLineIndex != null) {
    const n = Number(input.sdpMLineIndex);
    if (!Number.isInteger(n) || n < 0 || n > 32) return null;
    sdpMLineIndex = n;
  }

  return { candidate, sdpMid, sdpMLineIndex };
};

export const sanitizeSdp = (input) => {
  if (!input || typeof input !== "object") return null;

  const type = input.type;
  if (type !== "offer" && type !== "answer") return null;

  const sdp = typeof input.sdp === "string" ? input.sdp : "";
  if (!sdp || sdp.length > MAX_SDP_LEN) return null;

  // Reject null-byte poisoning outright.
  if (sdp.includes("\u0000")) return null;

  // #9 per-line hardening: cap line length + strip control chars per line.
  const lines = sdp.split(/\r?\n/);
  const cleanLines = [];
  for (const line of lines) {
    if (line.length > MAX_SDP_LINE_LEN) return null; // one oversized line = reject all
    if (CONTROL_CHARS_RE.test(line)) return null; // embedded control char = reject all
    cleanLines.push(line);
  }
  const cleaned = cleanLines.join("\r\n");

  // Basic WebRTC SDP sanity check.
  if (!/^v=0\r?$/m.test(cleaned)) return null;

  const mLines = (cleaned.match(/^m=/gm) || []).length;
  if (mLines === 0 || mLines > 8) return null;

  return { type, sdp: cleaned };
};

export const sanitizePeer = (input) => {
  if (typeof input === "string") {
    const id = cleanString(input, MAX_PEER_ID_LEN);
    return id ? { _id: id, name: null, photo: null } : null;
  }

  if (!input || typeof input !== "object") return null;

  const id = cleanString(input._id, MAX_PEER_ID_LEN);
  if (!id) return null;

  const name =
    typeof input.name === "string"
      ? input.name
          .replace(CONTROL_CHARS_RE, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_PEER_NAME_LEN)
      : null;

  const photo = cleanString(input.photo, MAX_PEER_PHOTO_LEN) || null;

  return { _id: id, name: name || null, photo };
};

export const sanitizeErrorMessage = (v) =>
  typeof v === "string"
    ? v.replace(CONTROL_CHARS_RE, "").trim().slice(0, MAX_ERROR_MESSAGE_LEN)
    : "Call error";
