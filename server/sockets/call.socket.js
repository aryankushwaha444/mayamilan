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
  listActiveForUser, // ✅ ADDED (was missing -> forced the dynamic import below)
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

let warnedNoTurn = false;
const buildIceServers = () => {
  const urls = (process.env.TURN_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const secret = process.env.TURN_STATIC_AUTH_SECRET;
  const servers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  if (urls.length && secret) {
    const username = `${Math.floor(Date.now() / 1000) + ICE_TTL_SEC}`;
    const credential = crypto
      .createHmac("sha1", secret)
      .update(username)
      .digest("base64");
    servers.push({ urls, username, credential });
  } else if (!warnedNoTurn) {
    warnedNoTurn = true;
    console.warn(
      "⚠️ No TURN configured (TURN_URL + TURN_STATIC_AUTH_SECRET). 1-to-1 calls will FAIL on symmetric NAT / restrictive firewalls. Set TURN env vars for production."
    );
  }
  return servers;
};

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
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of setupRate.entries())
    if (now - v.windowStart > 60000) setupRate.delete(k);
  for (const [k, v] of signalRate.entries())
    if (now - v.windowStart > 60000) signalRate.delete(k);
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
    clearRing(rec.callId);
    clearWatchdog(rec.callId);
    takeCall(rec.callId);
    await persistCall(rec, status, endReason);
    if (notifyPeerId) {
      io.to(`user:${notifyPeerId}`).emit("call:ended", {
        callId: rec.callId,
        by: "server",
        reason: endReason,
        status,
        durationMs: rec.connectedAt ? Date.now() - rec.connectedAt : 0,
      });
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

  socket.on("call:start", async ({ to, mediaType, conversationId } = {}) => {
    try {
      if (mediaType !== "audio" && mediaType !== "video")
        return socket.emit("call_error", { message: "Invalid media type" });
      if (!bump(setupRate, me, CALL_SETUP_RATE))
        return socket.emit("call_error", {
          message: "Too many call attempts. Slow down.",
          retryAfter: 60,
        });
      // ✅ FIXED cap: static import, no dynamic await, no empty if-stub
      if (listActiveForUser(me).length >= MAX_CONCURRENT_CALLS_PER_USER) {
        return socket.emit("call:busy", { reason: "max_concurrent" });
      }

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
      const iceServers = buildIceServers();
      createCall({
        callId,
        callerId: me,
        calleeId: String(to),
        mediaType,
        conversationId,
        callerSocketId: socket.id,
      });

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
          const rec = getCall(callId);
          if (rec && rec.state === "ringing")
            resolveCall(rec, "missed", "timeout", me);
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
          sdp.sdp.length > MAX_SDP_LEN
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
        if (!c.candidate) return;
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
