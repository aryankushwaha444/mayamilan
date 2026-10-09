import crypto from "crypto";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import Match from "../models/Match.js";
import Call from "../models/Call.js";
import { logAudit } from "../utils/auditLogger.js";
import {
  createCall,
  getCall,
  findActiveBetween,
  listActiveForUser,
  listActiveForSocket,
  markConnected,
  takeCall,
  setCalleeSocket,
} from "./callRegistry.js";

const RING_TIMEOUT_MS = parseInt(
  process.env.CALL_RING_TIMEOUT_MS || "30000",
  10
);
const CONNECT_DEADLINE_MS = parseInt(
  process.env.CALL_CONNECT_DEADLINE_MS || "45000",
  10
);
const WATCHDOG_INTERVAL_MS = parseInt(
  process.env.CALL_WATCHDOG_MS || "10000",
  10
);
const MAX_SDP_LEN = parseInt(process.env.CALL_MAX_SDP_LEN || "65536", 10);
const CALL_SETUP_RATE = parseInt(process.env.CALL_SETUP_RATE_LIMIT || "20", 10);
const CALL_SIGNAL_RATE = parseInt(
  process.env.CALL_SIGNAL_RATE_LIMIT || "300",
  10
);
const MAX_CONCURRENT_CALLS_PER_USER = parseInt(
  process.env.CALL_MAX_CONCURRENT_PER_USER || "3",
  10
);
const ICE_TTL_SEC = parseInt(process.env.TURN_CRED_TTL_SEC || "14400", 10);

const checkBlocked = async (u1, u2) => {
  const [a, b] = await Promise.all([
    User.findById(u1).select("blockedUsers").lean(),
    User.findById(u2).select("blockedUsers").lean(),
  ]);
  return (
    (a?.blockedUsers || []).some((id) => id.toString() === String(u2)) ||
    (b?.blockedUsers || []).some((id) => id.toString() === String(u1))
  );
};
const checkMatched = async (u1, u2) => {
  const m = await Match.findOne({
    users: { $all: [u1, u2] },
    isActive: { $ne: false },
  }).lean();
  return !!m;
};
const pairStillValid = async (callerId, calleeId) => {
  const [blocked, matched, cu, cc] = await Promise.all([
    checkBlocked(callerId, calleeId),
    checkMatched(callerId, calleeId),
    User.exists({ _id: callerId, isActive: true, deletedAt: null }),
    User.exists({ _id: calleeId, isActive: true, deletedAt: null }),
  ]);
  if (blocked) return "blocked";
  if (!matched) return "unmatched";
  if (!cu || !cc) return "inactive";
  return null;
};

const safeLogAudit = async (ctx, action, metadata) => {
  try {
    await logAudit(ctx, action, metadata);
  } catch {
    /* never kill the socket path */
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 🔒 CONNECTIVITY-FIX (Cloudflare Realtime TURN): the synchronous builder
//    below could not talk to Cloudflare (credential minting is an async POST),
//    so we add an async Cloudflare path FIRST and keep the existing static/HMAC
//    logic as a FALLBACK. Modes, in priority order:
//      1) Cloudflare Realtime TURN  (CLOUDFLARE_ACCOUNT_ID + _TURN_SERVICE_ID + _API_TOKEN set)
//      2) self-hosted coturn HMAC   (TURN_HOST/TURN_URL + TURN_STATIC_AUTH_SECRET)
//      3) managed static creds      (TURN_URL + TURN_USERNAME + TURN_PASSWORD)
//      4) STUN-only                 (warn once; mobile/cellular WILL fail)
//    Credentials are CACHED and de-duplicated in-flight so a burst of call:start
//    does not hammer the Cloudflare API, and every fetch is bounded by a 10s
//    AbortController so a Cloudflare outage degrades to STUN instead of hanging
//    the caller. The API token / secret NEVER leave the server: the browser only
//    ever receives short-lived username/credential pairs.
// ═══════════════════════════════════════════════════════════════════════
const CLOUDFLARE_ACCOUNT_ID = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const CLOUDFLARE_TURN_SERVICE_ID = (
  process.env.CLOUDFLARE_REALTIME_TURN_SERVICE_ID ||
  process.env.CLOUDFLARE_TURN_SERVICE_ID ||
  ""
).trim();
const CLOUDFLARE_API_TOKEN = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
const CLOUDFLARE_TURN_TTL_SEC = Math.min(
  Math.max(
    parseInt(
      process.env.CLOUDFLARE_TURN_TTL_SEC ||
        process.env.TURN_CRED_TTL_SEC ||
        "3600",
      10
    ) || 3600,
    300
  ),
  43200
);
const CLOUDFLARE_TURN_ENABLED = Boolean(
  CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_TURN_SERVICE_ID && CLOUDFLARE_API_TOKEN
);

let cfTurnCache = null; // { iceServers, expiresAt }
let cfTurnInFlight = null; // shared promise -> concurrent callers reuse one fetch

const normalizeIceServer = (s) => {
  if (!s || typeof s !== "object") return null;
  const rawUrls = Array.isArray(s.urls)
    ? s.urls
    : Array.isArray(s.uris)
    ? s.uris
    : typeof s.url === "string"
    ? [s.url]
    : [];
  const urls = rawUrls.map((u) => String(u || "").trim()).filter(Boolean);
  if (!urls.length) return null;
  const out = { urls };
  if (s.username) out.username = String(s.username);
  if (s.credential) out.credential = String(s.credential);
  if (s.credentialType) out.credentialType = String(s.credentialType);
  return out;
};

async function fetchCloudflareTurnIceServers() {
  const now = Date.now();
  if (cfTurnCache && cfTurnCache.expiresAt > now + 30000) {
    return cfTurnCache.iceServers; // still valid (30s safety margin)
  }
  if (cfTurnInFlight) return cfTurnInFlight; // coalesce concurrent requests

  cfTurnInFlight = (async () => {
    const endpoint =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}` +
      `/realtime/turn/services/` +
      `${encodeURIComponent(CLOUDFLARE_TURN_SERVICE_ID)}` +
      `/credentials`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: CLOUDFLARE_TURN_TTL_SEC }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        const msg =
          json?.errors?.[0]?.message || json?.message || `HTTP ${res.status}`;
        throw new Error(`Cloudflare TURN credential error: ${msg}`);
      }
      const rawList =
        json?.result?.iceServers ||
        json?.result?.turnServers ||
        json?.result?.uris ||
        json?.iceServers ||
        [];
      const list = (Array.isArray(rawList) ? rawList : [rawList])
        .map(normalizeIceServer)
        .filter(Boolean);
      if (!list.length) {
        throw new Error(
          "Cloudflare TURN response did not include usable iceServers"
        );
      }
      const expiresFromApi = json?.result?.expiresAt
        ? Date.parse(json.result.expiresAt)
        : NaN;
      const expiresAt =
        Number.isFinite(expiresFromApi) && expiresFromApi > now + 30000
          ? expiresFromApi - 30000
          : now + Math.max(60000, (CLOUDFLARE_TURN_TTL_SEC - 120) * 1000);
      cfTurnCache = { iceServers: list, expiresAt };
      return list;
    } finally {
      clearTimeout(timeout);
      cfTurnInFlight = null;
    }
  })();

  return cfTurnInFlight;
}

// 🔒 CONNECTIVITY-FIX: TURN emission previously required an HMAC secret AND a
//    hand-listed TURN_URL, so (a) managed/static-credential providers (Xirsys,
//    OpenAgora, Cloudflare Calls, Twilio) got NO relay -> mobile/cellular failed,
//    and (b) a single UDP-only turn: URL died on UDP-throttling carriers. Now we
//    accept EITHER time-limited HMAC (coturn use-auth-secret) OR static
//    username/password, and we AUTO-BUILD udp + tcp:443 + tls:443 from TURN_HOST
//    when TURN_URL is empty. We never push a credential-less turn: (it would just
//    fail auth and waste ICE candidates).
const TURN_HOST = (process.env.TURN_HOST || "").trim();
const TURN_PORT = parseInt(process.env.TURN_PORT || "3478", 10);
const TURN_TLS_PORT = parseInt(process.env.TURN_TLS_PORT || "443", 10);
const TURN_URL_RAW = process.env.TURN_URL || process.env.TURN_URLS || "";
const TURN_SECRET =
  process.env.TURN_STATIC_AUTH_SECRET || process.env.TURN_AUTH_SECRET || "";
const TURN_USER = process.env.TURN_USERNAME || "";
const TURN_PASS =
  process.env.TURN_PASSWORD || process.env.TURN_CREDENTIAL || "";

const turnUrlsFromHost = () => {
  if (!TURN_HOST) return [];
  const h = TURN_HOST;
  return [
    `turn:${h}:${TURN_PORT}`, // UDP
    `turn:${h}:${TURN_PORT}?transport=tcp`, // TCP on the TURN port
    `turn:${h}:${TURN_TLS_PORT}?transport=tcp`, // TCP on 443 (firewall-friendly)
    `turns:${h}:${TURN_TLS_PORT}`, // TLS (most reliable through corporate/mobile NAT)
  ];
};

const stunServers = () => [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

let warnedNoTurn = false;
let warnedNoTurnCreds = false;
let warnedCloudflareTurn = false;

// 🔒 CONNECTIVITY-FIX: now ASYNC. Cloudflare first (cached), then the EXACT prior
//    static/HMAC fallback (same warnings, same STUN-only returns). Callers MUST
//    `await` this (see call:start) or a Promise leaks into the ICE payload.
const buildIceServers = async () => {
  // 1) Preferred: Cloudflare Realtime TURN
  if (CLOUDFLARE_TURN_ENABLED) {
    try {
      const cf = await fetchCloudflareTurnIceServers();
      return [...stunServers(), ...cf];
    } catch (e) {
      if (!warnedCloudflareTurn) {
        warnedCloudflareTurn = true;
        console.warn(
          "⚠️ Cloudflare Realtime TURN credential fetch failed. Falling back to static TURN env if configured:",
          e?.message || e
        );
      }
      // fall through to static/HMAC fallback below
    }
  }

  // 2/3/4) Fallback: self-hosted coturn HMAC / managed static creds / STUN-only
  //        (logic preserved verbatim from the previous synchronous builder)
  const servers = stunServers();
  let urls = TURN_URL_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!urls.length) urls = turnUrlsFromHost();

  if (!urls.length) {
    if (!warnedNoTurn) {
      warnedNoTurn = true;
      console.warn(
        "⚠️ No TURN configured (Cloudflare env unset, and no TURN_URL/TURN_HOST). 1-to-1 calls will FAIL on symmetric NAT / mobile carriers. Configure Cloudflare Realtime TURN or coturn for production."
      );
    }
    return servers;
  }

  let username;
  let credential;
  if (TURN_SECRET) {
    // coturn use-auth-secret: username = expiry unix time, credential =
    // base64(HMAC-SHA1(secret, username)). Pure-timestamp username is valid.
    username = String(Math.floor(Date.now() / 1000) + ICE_TTL_SEC);
    credential = crypto
      .createHmac("sha1", TURN_SECRET)
      .update(username)
      .digest("base64");
  } else if (TURN_USER && TURN_PASS) {
    // Managed / static-credential provider.
    username = TURN_USER;
    credential = TURN_PASS;
  } else {
    // Has URLs but no way to authenticate them -> sending them would only burn
    // ICE candidates on 401s. Fall back to STUN-only and warn once.
    if (!warnedNoTurnCreds) {
      warnedNoTurnCreds = true;
      console.warn(
        "⚠️ TURN URLs configured but NO credentials (need TURN_STATIC_AUTH_SECRET for HMAC, or TURN_USERNAME+TURN_PASSWORD for static). TURN will NOT be sent; mobile/cellular calls may fail. Calls will use STUN only."
      );
    }
    return servers;
  }

  servers.push({ urls, username, credential });
  return servers;
};

// Warm-up: pre-populate the Cloudflare cache ~1s after boot so the FIRST call
// after a Render restart doesn't pay the credential-fetch latency. unref'd so it
// never holds the event loop open. No-op when Cloudflare isn't configured.
if (CLOUDFLARE_TURN_ENABLED) {
  const t = setTimeout(() => {
    void fetchCloudflareTurnIceServers().catch(() => {});
  }, 1000);
  t.unref?.();
}

const setupRate = new Map();
const signalRate = new Map();
const bump = (map, key, limit) => {
  const now = Date.now();
  const t = map.get(key) || { count: 0, windowStart: now };
  if (now - t.windowStart > 60000) {
    t.count = 1;
    t.windowStart = now;
  } else {
    t.count++;
  }
  map.set(key, t);
  return t.count <= limit;
};

// ✅ race-safe once-only finalization (hangup colliding with ring-timeout must not
// double-write a Call doc or double-emit a chat row). Keyed by callId + timestamp.
const CHAT_DONE = new Map();

// 🔒 ATTACKER-FIX: bound offline "missed call" writes. Without this, an
// authenticated caller could hammer an OFFLINE match 20/min and each attempt
// wrote a Call doc + a Message row + bumped the conversation -> storage/chat DoS
// and a flooded inbox when the victim returns. The caller is still told "offline"
// instantly every time; we just suppress the durable row to <=1 per pair/minute.
const OFFLINE_COOLDOWN_MS = 60000;
const offlineCooldown = new Map(); // "caller:callee" -> lastWriteTs

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of setupRate.entries())
    if (now - v.windowStart > 60000) setupRate.delete(k);
  for (const [k, v] of signalRate.entries())
    if (now - v.windowStart > 60000) signalRate.delete(k);
  const cutoff = now - 15 * 60 * 1000;
  for (const [k, v] of CHAT_DONE.entries()) if (v < cutoff) CHAT_DONE.delete(k);
  const ocCut = now - 5 * 60 * 1000;
  for (const [k, v] of offlineCooldown.entries())
    if (v < ocCut) offlineCooldown.delete(k);
}, 60 * 1000).unref?.();

const watchdogs = new Map();
const clearWatchdog = (callId) => {
  const t = watchdogs.get(callId);
  if (t) {
    clearInterval(t);
    watchdogs.delete(callId);
  }
};

const newCallId = () => `call_${crypto.randomBytes(9).toString("base64url")}`;

const persistCall = async (rec, status, endReason) => {
  const now = new Date();
  try {
    await Call.create({
      caller: rec.callerId,
      callee: rec.calleeId,
      conversationId: rec.conversationId,
      mediaType: rec.mediaType,
      status,
      startedAt: new Date(rec.createdAt),
      connectedAt: rec.connectedAt ? new Date(rec.connectedAt) : null,
      endedAt: now,
      endReason,
    });
  } catch (e) {
    console.error("Call persist failed:", e.message);
  }
};

// ✅ Boot-safe lazy Message access (no top-level import -> a wrong export can never
// crash the server at boot, which matters given the standalone/replica-set fragility).
let MessageModel = null; // null=unknown, false=unavailable, object=ready
const getMessageModel = async () => {
  if (MessageModel !== null) return MessageModel;
  try {
    const mod = await import("../models/Message.js");
    MessageModel = mod.default || mod.Message || false;
  } catch {
    MessageModel = false;
  }
  return MessageModel;
};

// ✅ server terminal (status+endReason) -> chat callStatus the client CALL_LABEL knows.
const mapChatCallStatus = (status, endReason) => {
  const s = String(status || "").toLowerCase();
  const r = String(endReason || "").toLowerCase();
  if (s === "ended") return "ended";
  if (s === "rejected") {
    if (r === "busy") return "busy";
    if (r === "blocked") return "blocked";
    if (r === "unmatched" || r === "inactive") return "ended";
    return "declined";
  }
  if (s === "failed") return "failed";
  return "missed";
};

// ✅ THE durable bridge: write a real type:"call" Message (+ bump the conversation so
// the SIDEBAR also survives refresh), then emit live to both user rooms. Self-diagnosing:
// on a throw it prints the exact offending field/enum (mode A); on a success with
// stripped metadata it warns which fields to declare (mode B). Never throws into teardown.
const emitCallChatRow = async (io, rec, chatStatus, durationMs) => {
  try {
    const convId = rec.conversationId;
    if (!convId || !mongoose.Types.ObjectId.isValid(convId)) return; // no thread to attach to
    const convIdStr = String(convId);
    const startedAt = new Date(rec.createdAt || Date.now());
    const endedAt = new Date();
    const callType = rec.mediaType === "video" ? "video" : "audio";
    const safeDur =
      chatStatus === "ended" && Number.isFinite(+durationMs) && +durationMs > 0
        ? Math.min(+durationMs, 24 * 60 * 60 * 1000)
        : 0;

    const base = {
      conversation: convIdStr,
      sender: String(rec.callerId),
      receiver: String(rec.calleeId),
      type: "call",
      text: "",
      callType,
      callStatus: chatStatus,
      durationMs: safeDur,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      callId: String(rec.callId),
    };

    let payload = {
      ...base,
      _id: "callmsg:" + String(rec.callId),
      createdAt: startedAt.toISOString(),
    };
    let savedDoc = null;
    try {
      const M = await getMessageModel();
      if (M) {
        savedDoc = await M.create({
          conversation: convIdStr,
          sender: base.sender,
          receiver: base.receiver,
          type: "call",
          text: "",
          callType,
          callStatus: chatStatus,
          durationMs: safeDur,
          startedAt,
          endedAt,
          callId: base.callId,
        });
        payload = {
          ...base,
          _id: String(savedDoc._id),
          createdAt:
            (savedDoc.createdAt || startedAt).toISOString?.() ||
            String(savedDoc.createdAt || startedAt),
        };
      }
    } catch (e) {
      // mode A: enum/validation threw -> row will NOT persist across refresh.
      const paths =
        e && e.errors
          ? Object.keys(e.errors).join(", ")
          : e?.message || String(e);
      console.error(
        "[call-chat] Message.create REJECTED -> call row is live-only and will vanish on refresh. Offending field(s):",
        paths,
        '| Add them to server/models/Message.js (see instructions: add "call" to the type enum + declare the call fields).'
      );
    }

    // mode B: row saved but strict schema stripped the call metadata -> details lost.
    if (
      savedDoc &&
      (savedDoc.callStatus == null || savedDoc.callType == null)
    ) {
      console.warn(
        "[call-chat] Message saved but call metadata was STRIPPED by strict schema. Declare callType/callStatus/durationMs/startedAt/endedAt/callId in server/models/Message.js so duration & label persist across refresh."
      );
    }

    // ✅ bump the conversation so the sidebar shows the call as lastMessage after reload.
    // updateOne (not findByIdAndUpdate) avoids the Mongoose `new` deprecation you already see.
    if (savedDoc) {
      try {
        await Conversation.updateOne(
          { _id: convIdStr },
          {
            $set: {
              lastMessage: savedDoc._id,
              lastMessageAt: savedDoc.createdAt || endedAt,
            },
          }
        );
      } catch (e) {
        console.error(
          "[call-chat] conversation lastMessage bump failed (non-fatal):",
          e?.message || e
        );
      }
    }

    // ✅ instant live paint for both participants (user rooms; same targeting call:ring uses).
    for (const uid of [base.sender, base.receiver]) {
      io.to(`user:${uid}`).emit("new_message", payload);
      io.to(`user:${uid}`).emit("conversation_updated", {
        conversationId: convIdStr,
        message: payload,
      });
    }
  } catch (e) {
    console.error("emitCallChatRow error (non-fatal):", e?.message || e);
  }
};

const registerCallSocket = (io, socket) => {
  const me = socket.user._id.toString();
  const ringTimers = new Map();
  const ctx = () => ({ ip: socket.handshake.address, user: { _id: me } });
  const clearRing = (callId) => {
    const t = ringTimers.get(callId);
    if (t) {
      clearTimeout(t);
      ringTimers.delete(callId);
    }
  };

  const resolveCall = async (rec, status, endReason, notifyPeerId) => {
    try {
      clearRing(rec.callId);
      clearWatchdog(rec.callId);
      if (CHAT_DONE.has(rec.callId)) return; // another path already finalized
      CHAT_DONE.set(rec.callId, Date.now());

      takeCall(rec.callId);
      await persistCall(rec, status, endReason);

      const durationMs = rec.connectedAt ? Date.now() - rec.connectedAt : 0;
      const chatStatus = mapChatCallStatus(status, endReason);
      await emitCallChatRow(io, rec, chatStatus, durationMs); // ✅ durable + live chat row

      if (notifyPeerId) {
        io.to(`user:${notifyPeerId}`).emit("call:ended", {
          callId: rec.callId,
          by: "server",
          reason: endReason,
          status,
          durationMs,
        });
      }
    } catch (e) {
      console.error("resolveCall error:", e?.message || e);
    }
  };

  const startWatchdog = (rec) => {
    clearWatchdog(rec.callId);
    const id = rec.callId;
    const t = setInterval(async () => {
      const r = getCall(id);
      if (!r) {
        clearWatchdog(id);
        return;
      }
      try {
        if (
          r.state === "connecting" &&
          r.acceptedAt &&
          Date.now() - r.acceptedAt > CONNECT_DEADLINE_MS
        ) {
          await resolveCall(
            r,
            "failed",
            "error",
            r.callerId === me ? r.calleeId : r.callerId
          );
          return;
        }
        if (r.state === "ringing") return;
        const viol = await pairStillValid(r.callerId, r.calleeId);
        if (viol) {
          const peer = r.callerId === me ? r.calleeId : r.callerId;
          await resolveCall(r, r.connectedAt ? "ended" : "missed", viol, peer);
          await safeLogAudit(ctx(), "call_blocked_attempt", {
            reason: viol,
            targetUserId: peer,
          });
        }
      } catch (e) {
        console.error("call watchdog error:", e.message);
      }
    }, WATCHDOG_INTERVAL_MS);
    t.unref?.();
    watchdogs.set(id, t);
  };

  const assertCanReach = async (to) => {
    if (!mongoose.Types.ObjectId.isValid(to))
      return { ok: false, code: "bad_id" };
    if (String(to) === me) return { ok: false, code: "self" };
    if (await checkBlocked(me, to)) return { ok: false, code: "blocked" };
    if (!(await checkMatched(me, to))) return { ok: false, code: "unmatched" };
    return { ok: true };
  };

  // ✅ authoritative presence probe (socket.io v4 room introspection); permissive fallback.
  const isUserOnline = (uid) => {
    try {
      const room = io.sockets?.adapter?.rooms?.get?.(`user:${String(uid)}`);
      return !!room && room.size > 0;
    } catch {
      return true;
    }
  };

  socket.on("call:start", async ({ to, mediaType, conversationId } = {}) => {
    try {
      if (mediaType !== "audio" && mediaType !== "video")
        return socket.emit("call_error", { message: "Invalid media type" });
      if (!bump(setupRate, me, CALL_SETUP_RATE))
        return socket.emit("call_error", {
          message: "Too many call attempts. Slow down.",
          retryAfter: 60,
        });
      if (listActiveForUser(me).length >= MAX_CONCURRENT_CALLS_PER_USER)
        return socket.emit("call:busy", { reason: "max_concurrent" });

      const auth = await assertCanReach(to);
      if (!auth.ok) {
        await safeLogAudit(ctx(), "call_blocked_attempt", {
          reason: `call_${auth.code}`,
          targetUserId: to,
        });
        return socket.emit("call_error", {
          message:
            auth.code === "blocked"
              ? "Cannot call this user"
              : "You must be matched to call",
        });
      }
      if (conversationId) {
        if (!mongoose.Types.ObjectId.isValid(conversationId))
          return socket.emit("call_error", { message: "Invalid conversation" });
        const convOk = await Conversation.exists({
          _id: conversationId,
          participants: { $all: [me, to] },
          isActive: { $ne: false },
        });
        if (!convOk)
          return socket.emit("call_error", {
            message: "Conversation not found",
          });
      }
      if (findActiveBetween(me, to))
        return socket.emit("call:busy", {
          with: to,
          reason: "already_in_call",
        });

      const callId = newCallId();
      const iceServers = await buildIceServers(); // 🔒 CONNECTIVITY-FIX: await the async builder
      createCall({
        callId,
        callerId: me,
        calleeId: String(to),
        mediaType,
        conversationId,
        callerSocketId: socket.id,
      });
      const rec = getCall(callId);

      // ✅ never ring an offline user; still hand the client a callId (call:ready) so the
      // shipped client dedupe by callId holds, then persist + emit a "missed" chat row.
      if (!isUserOnline(to)) {
        socket.emit("call:ready", {
          callId,
          iceServers,
          mediaType,
          to: String(to),
        });
        socket.emit("call:rejected", { callId, reason: "offline" });
        await safeLogAudit(ctx(), "call_offline", {
          targetUserId: String(to),
          mediaType,
          conversationId,
        });
        if (rec) {
          // 🔒 ATTACKER-FIX: tell the caller "offline" every time, but only write the
          // durable missed-call row once per pair per minute (bounds storage/chat spam).
          const ck = `${me}:${String(to)}`;
          const last = offlineCooldown.get(ck) || 0;
          const nowTs = Date.now();
          if (nowTs - last < OFFLINE_COOLDOWN_MS) {
            clearRing(rec.callId);
            takeCall(rec.callId); // drop from registry WITHOUT writing Call/Message
          } else {
            offlineCooldown.set(ck, nowTs);
            await resolveCall(rec, "missed", "offline", null);
          }
        }
        return;
      }

      socket.emit("call:ready", {
        callId,
        iceServers,
        mediaType,
        to: String(to),
      });
      const peer = await User.findById(me).select("name photos").lean();
      io.to(`user:${to}`).emit("call:ring", {
        callId,
        from: {
          _id: me,
          name: peer?.name || "Someone",
          photo: peer?.photos?.[0]?.url || null,
        },
        mediaType,
        iceServers,
        conversationId: conversationId || null,
      });
      ringTimers.set(
        callId,
        setTimeout(() => {
          const r = getCall(callId);
          if (r && r.state === "ringing")
            void resolveCall(r, "missed", "timeout", me);
        }, RING_TIMEOUT_MS)
      );
      await safeLogAudit(ctx(), "call_invited", {
        targetUserId: String(to),
        mediaType,
        conversationId,
      });
    } catch (e) {
      console.error("call:start error:", e);
      socket.emit("call_error", { message: "Failed to start call" });
    }
  });

  socket.on("call:accept", async ({ callId } = {}) => {
    try {
      const rec = getCall(callId);
      if (!rec || rec.state !== "ringing" || rec.calleeId !== me) return;
      if (!bump(setupRate, me, CALL_SETUP_RATE))
        return socket.emit("call_error", {
          message: "Too many call attempts.",
        });
      const auth = await assertCanReach(rec.callerId);
      if (!auth.ok) {
        await resolveCall(
          rec,
          "rejected",
          auth.code === "blocked" ? "blocked" : "unmatched",
          rec.callerId
        );
        await safeLogAudit(ctx(), "call_blocked_attempt", {
          reason: `accept_${auth.code}`,
          targetUserId: rec.callerId,
        });
        return;
      }
      clearRing(callId);
      rec.state = "connecting";
      setCalleeSocket(callId, socket.id, Date.now());
      io.to(`user:${rec.callerId}`).emit("call:accepted", { callId, from: me });
      socket.to(`user:${me}`).emit("call:dismiss", { callId });
      startWatchdog(rec);
      await safeLogAudit(ctx(), "call_accepted", {
        targetUserId: rec.callerId,
        mediaType: rec.mediaType,
      });
    } catch (e) {
      console.error("call:accept error:", e);
    }
  });

  socket.on("call:reject", async ({ callId, reason = "declined" } = {}) => {
    try {
      const rec = getCall(callId);
      if (!rec || rec.calleeId !== me) return;
      const safeReason = ["declined", "busy"].includes(reason)
        ? reason
        : "declined";
      await resolveCall(rec, "rejected", safeReason, rec.callerId);
      await safeLogAudit(ctx(), "call_rejected", {
        targetUserId: rec.callerId,
        reason: safeReason,
      });
    } catch (e) {
      console.error("call:reject error:", e);
    }
  });

  socket.on("call:signal", async ({ callId, to, sdp, candidate } = {}) => {
    try {
      const rec = getCall(callId);
      if (!rec || rec.state === "ended" || rec.state === "ringing") return;
      const other = String(to);
      if (!mongoose.Types.ObjectId.isValid(other)) return;
      const isCaller = rec.callerId === me && other === rec.calleeId;
      const isCallee = rec.calleeId === me && other === rec.callerId;
      if (!isCaller && !isCallee) return;
      if (!bump(signalRate, me, CALL_SIGNAL_RATE)) return;
      if (sdp !== undefined) {
        if (
          typeof sdp !== "object" ||
          !sdp ||
          typeof sdp.sdp !== "string" ||
          !["offer", "answer"].includes(sdp.type) ||
          sdp.sdp.length > MAX_SDP_LEN ||
          !/^v=0\r?$/m.test(sdp.sdp)
        )
          return;
        io.to(`user:${other}`).emit("call:signal", { callId, from: me, sdp });
      } else if (candidate !== undefined) {
        if (typeof candidate !== "object" || !candidate) return;
        const c = {
          candidate:
            typeof candidate.candidate === "string"
              ? candidate.candidate.slice(0, 2048)
              : undefined,
          sdpMid:
            typeof candidate.sdpMid === "string"
              ? candidate.sdpMid.slice(0, 64)
              : candidate.sdpMid ?? null,
          sdpMLineIndex: Number.isInteger(candidate.sdpMLineIndex)
            ? candidate.sdpMLineIndex
            : null,
        };
        if (c.candidate && !/^candidate:/i.test(c.candidate)) return; // allow empty (end-of-candidates)
        io.to(`user:${other}`).emit("call:signal", {
          callId,
          from: me,
          candidate: c,
        });
      }
    } catch (e) {
      console.error("call:signal error:", e);
    }
  });

  socket.on("call:connected", async ({ callId } = {}) => {
    try {
      const rec = getCall(callId);
      if (!rec || rec.state === "ended" || rec.state === "ringing") return;
      if (rec.callerId !== me && rec.calleeId !== me) return;
      markConnected(callId);
    } catch (e) {
      console.error("call:connected error:", e);
    }
  });

  socket.on("call:end", async ({ callId, reason = "hangup" } = {}) => {
    try {
      const rec = getCall(callId);
      if (!rec || (rec.callerId !== me && rec.calleeId !== me)) return;
      const safeReason = [
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
      ].includes(reason)
        ? reason
        : "hangup";
      const status = rec.connectedAt
        ? "ended"
        : rec.state === "ringing" && rec.calleeId === me
        ? "rejected"
        : "missed";
      const peer = rec.callerId === me ? rec.calleeId : rec.callerId;
      await resolveCall(rec, status, safeReason, peer);
      await safeLogAudit(ctx(), "call_ended", {
        targetUserId: peer,
        reason: safeReason,
        status,
        durationMs: rec.connectedAt ? Date.now() - rec.connectedAt : 0,
      });
    } catch (e) {
      console.error("call:end error:", e);
    }
  });

  socket.on("disconnect", async () => {
    try {
      const recs = listActiveForSocket(me, socket.id);
      for (const rec of recs) {
        const peer = rec.callerId === me ? rec.calleeId : rec.callerId;
        const status = rec.connectedAt ? "ended" : "missed";
        await resolveCall(rec, status, "disconnected", peer);
      }
    } catch (e) {
      console.error("call disconnect cleanup error:", e);
    }
  });
};

export default registerCallSocket;

export const findActiveCallForTeardown = (a, b) => findActiveBetween(a, b);
export const takeCallForTeardown = (callId) => {
  clearWatchdog(callId);
  return takeCall(callId);
};
export const persistCallForTeardown = persistCall;
