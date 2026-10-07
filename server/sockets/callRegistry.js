// In-memory call-session registry for 1-to-1 signaling. Single-process assumption
// (matches userConnections/rate trackers in socket.js). On scaled/multi-instance
// deploys this MUST move to Redis (the still-owed cache.js). State-only: never imports
// socket.js/io, so user.controller.js and call.socket.js can both use it cycle-free.

const byId = new Map(); // callId -> record
const byPair = new Map(); // "min|max" -> callId   (one active call per pair)

const pairKey = (a, b) => [String(a), String(b)].sort().join("|");

export const createCall = ({
  callId,
  callerId,
  calleeId,
  mediaType,
  conversationId,
  callerSocketId,
}) => {
  const record = {
    callId,
    callerId: String(callerId),
    calleeId: String(calleeId),
    mediaType,
    conversationId: conversationId ? String(conversationId) : null,
    state: "ringing",
    createdAt: Date.now(),
    acceptedAt: null,
    connectedAt: null,
    callerSocketId: callerSocketId || null, // ✅ which socket is driving the caller side
    calleeSocketId: null, // set on accept (which tab accepted)
  };
  byId.set(callId, record);
  byPair.set(pairKey(callerId, calleeId), callId);
  return record;
};

export const getCall = (callId) => byId.get(callId) || null;

export const findActiveBetween = (a, b) => {
  const id = byPair.get(pairKey(a, b));
  if (!id) return null;
  const rec = byId.get(id);
  return rec && rec.state !== "ended" ? rec : null;
};

export const listActiveForUser = (uid) => {
  const u = String(uid);
  const out = [];
  for (const rec of byId.values()) {
    if (rec.state !== "ended" && (rec.callerId === u || rec.calleeId === u))
      out.push(rec);
  }
  return out;
};

// ✅ which of THIS user's active calls are owned by a given socket (for disconnect scoping)
export const listActiveForSocket = (uid, socketId) =>
  listActiveForUser(uid).filter(
    (r) => r.callerSocketId === socketId || r.calleeSocketId === socketId
  );

export const setCalleeSocket = (callId, socketId, acceptedAt) => {
  const rec = byId.get(callId);
  if (rec && rec.state !== "ended") {
    rec.calleeSocketId = socketId || null;
    rec.acceptedAt = acceptedAt || Date.now();
  }
  return rec;
};

export const markConnected = (callId) => {
  const rec = byId.get(callId);
  if (rec && rec.state !== "ended") {
    rec.state = "connected";
    rec.connectedAt = Date.now();
  }
  return rec;
};

export const takeCall = (callId) => {
  const rec = byId.get(callId);
  if (!rec) return null;
  byId.delete(callId);
  if (byPair.get(pairKey(rec.callerId, rec.calleeId)) === callId)
    byPair.delete(pairKey(rec.callerId, rec.calleeId));
  rec.state = "ended";
  return rec;
};

export const _debugSize = () => byId.size;
