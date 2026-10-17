// src/utils/callSecurity.ts
//
// Zero-guess validation foundation for the WebRTC call state machine.
//
// SECURITY PURPOSE:
//  - live signaling call ids are backend-generated strings, not MongoDB ObjectIds
//  - database/user ids are ObjectIds
//  - incoming caller metadata is attacker-controlled and is sanitized/capped
//  - incoming caller photo is media-allowlisted before it can enter UI state
//  - remote SDP is fail-closed through DTLS-SRTP assertion
//  - ICE candidates are structurally validated and control-char stripped
//  - server-owned call status/reason enums are reflected deterministically
//  - client must never be trusted for duration

import { isObjectId, isSafeMediaUrl } from "./media";
import { assertEncryptedSdp } from "./webrtcSecurity";

export const CONTROL_CHARS_RE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

const stripCtl = (s: string) => s.replace(CONTROL_CHARS_RE, "");

const lower = (x: unknown): string =>
  typeof x === "string" ? stripCtl(x).trim().toLowerCase() : "";

const eq = (a: string, b: string): boolean => a === b;

const safeUrl = (x: unknown): string | null =>
  isSafeMediaUrl(x) ? (x as string) : null;

// Backend live call id:
//   call_${crypto.randomBytes(9).toString("base64url")}
// Also tolerate ObjectId-shaped database ids for history/reporting surfaces.
const LIVE_CALL_ID_RE = /^call_[A-Za-z0-9_-]{6,64}$/;

export function sanitizeCallId(x: unknown): string | null {
  if (typeof x !== "string") return null;

  const s = stripCtl(x).trim().slice(0, 80);

  if (LIVE_CALL_ID_RE.test(s)) return s;
  if (isObjectId(s)) return s;

  return null;
}

export interface SafePeer {
  _id: string;
  name: string | null;
  photo: string | null;
}

export function sanitizePeer(x: unknown): SafePeer | null {
  if (!x || typeof x !== "object") return null;

  const o = x as any;

  const id = isObjectId(o._id) ? o._id : null;
  if (!id) return null;

  const name =
    typeof o.name === "string"
      ? stripCtl(o.name).trim().slice(0, 60) || null
      : null;

  let photo: string | null = safeUrl(o.photo);

  if (!photo && Array.isArray(o.photos)) {
    const pick =
      o.photos.find((p: any) => p?.isPrimary === true) || o.photos[0];

    const candidate =
      typeof pick === "string"
        ? pick
        : pick && typeof pick.url === "string"
        ? pick.url
        : null;

    photo = safeUrl(candidate);
  }

  return { _id: id, name, photo };
}

export function sanitizeErrorMessage(x: unknown): string {
  if (typeof x !== "string") return "Call error";

  const s = stripCtl(x).trim().slice(0, 200);
  return s.length ? s : "Call error";
}

export function gateSdp(sdp: unknown): boolean {
  if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > 65536)
    return false;

  try {
    return assertEncryptedSdp(sdp);
  } catch {
    return false;
  }
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number;
}

export function sanitizeIceCandidate(x: unknown): IceCandidateInit | null {
  if (!x || typeof x !== "object") return null;

  const o = x as any;

  if (typeof o.candidate !== "string") return null;

  const candidate = stripCtl(o.candidate).slice(0, 4096);

  // Empty candidate is valid end-of-candidates. Non-empty must look like a real candidate.
  if (candidate && !/^candidate:/i.test(candidate)) return null;

  const idx = Number(o.sdpMLineIndex);
  if (!Number.isInteger(idx) || idx < 0) return null;

  return {
    candidate,
    sdpMid: typeof o.sdpMid === "string" ? o.sdpMid : null,
    sdpMLineIndex: idx,
  };
}

export const CALL_MEDIA_TYPES = ["audio", "video"] as const;
export type CallMediaType = (typeof CALL_MEDIA_TYPES)[number];

export const CALL_PERSISTED_STATUSES = [
  "missed",
  "rejected",
  "ended",
  "failed",
] as const;
export type CallPersistedStatus = (typeof CALL_PERSISTED_STATUSES)[number];

export const CALL_END_REASONS = [
  "hangup",
  "declined",
  "missed",
  "timeout",
  "disconnected",
  "busy",
  "blocked",
  "unmatched",
  "inactive",
  "error",
] as const;
export type CallEndReason = (typeof CALL_END_REASONS)[number];

export type CallUiStatus =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "connected"
  | "ended"
  | "failed"
  | "no-answer"
  | "declined"
  | "busy"
  | "canceled";

export function sanitizeMediaType(x: unknown): CallMediaType | null {
  const v = lower(x);

  if (eq(v, "audio")) return "audio";
  if (eq(v, "video")) return "video";

  return null;
}

export function sanitizePersistedStatus(
  x: unknown
): CallPersistedStatus | null {
  const v = lower(x);

  if (eq(v, "missed")) return "missed";
  if (eq(v, "rejected")) return "rejected";
  if (eq(v, "ended")) return "ended";
  if (eq(v, "failed")) return "failed";

  return null;
}

export function sanitizeEndReason(x: unknown): CallEndReason | null {
  const v = lower(x);

  if (eq(v, "hangup")) return "hangup";
  if (eq(v, "declined")) return "declined";
  if (eq(v, "missed")) return "missed";
  if (eq(v, "timeout")) return "timeout";
  if (eq(v, "disconnected")) return "disconnected";
  if (eq(v, "busy")) return "busy";
  if (eq(v, "blocked")) return "blocked";
  if (eq(v, "unmatched")) return "unmatched";
  if (eq(v, "inactive")) return "inactive";
  if (eq(v, "error")) return "error";

  return null;
}

export function mapRejectedStatus(reason: unknown): CallUiStatus {
  const r = lower(reason);

  if (eq(r, "busy")) return "busy";
  if (eq(r, "timeout") || eq(r, "missed")) return "no-answer";
  if (eq(r, "error")) return "failed";
  if (eq(r, "disconnected") || eq(r, "blocked") || eq(r, "hangup"))
    return "ended";
  if (eq(r, "declined")) return "declined";

  return "declined";
}

export function mapEndedStatus(payload: unknown): CallUiStatus {
  if (!payload || typeof payload !== "object") return "ended";

  const o = payload as any;
  const s = lower(o?.status);
  const r = lower(o?.reason);

  if (eq(s, "missed") || eq(r, "missed") || eq(r, "timeout"))
    return "no-answer";

  if (eq(r, "busy")) return "busy";

  if (eq(s, "failed") || eq(r, "error")) return "failed";

  if (eq(s, "rejected") || eq(r, "declined")) return "declined";

  if (eq(r, "blocked") || eq(r, "disconnected") || eq(r, "hangup"))
    return "ended";

  return "ended";
}

export function callStatusLabel(
  status: CallUiStatus,
  opts?: {
    isVideo?: boolean;
    seconds?: number;
    durationMs?: number;
    reason?: unknown;
  }
): string {
  const isVideo = !!opts?.isVideo;
  const r = lower(opts?.reason);

  const durationMs = Number(opts?.durationMs);
  const safeDurationMs =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;

  const seconds = Number(opts?.seconds);
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;

  const fmtMs = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const fmtSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const durationLabel = safeDurationMs
    ? ` · ${fmtMs(safeDurationMs)}`
    : safeSeconds > 0
    ? ` · ${fmtSec(safeSeconds)}`
    : "";

  switch (status) {
    case "connected":
      return `${isVideo ? "HD Video Call" : "Voice Call"}${durationLabel}`;

    case "connecting":
    case "outgoing":
      return "Connecting…";

    case "incoming":
      return "Incoming call…";

    case "busy":
      return "Line busy";

    case "no-answer":
      return "No answer";

    case "declined":
      return "Declined";

    case "canceled":
      return "Canceled";

    case "failed":
      return "Call failed";

    case "ended":
      if (eq(r, "blocked")) return `Call ended (blocked)${durationLabel}`;
      if (eq(r, "disconnected")) return `Disconnected${durationLabel}`;
      return `Call ended${durationLabel}`;

    case "idle":
    default:
      return "Call ended";
  }
}
