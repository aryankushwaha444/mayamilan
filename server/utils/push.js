import webPush from "web-push";
import PushSubscription from "../models/PushSubscription.js";
import Match from "../models/Match.js";
import { getIO } from "../sockets/socket.js";

// ═══════════════════════════════════════════
// VAPID INITIALIZATION
// ═══════════════════════════════════════════

// ✅ FIX: Check BOTH keys and wrap in try/catch to prevent startup crashes
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || "admin@example.com"}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.error("❌ Failed to initialize Web Push VAPID:", err.message);
  }
}

// ═══════════════════════════════════════════
// PUSH NOTIFICATION HELPERS
// ═══════════════════════════════════════════

/**
 * Send a push notification to ALL devices of a single user.
 * Automatically cleans up invalid (404/410) subscriptions.
 */
export const sendPush = async (
  userId,
  { title, body, url = "/notifications", tag }
) => {
  if (!process.env.VAPID_PUBLIC_KEY || !userId) return;

  const subs = await PushSubscription.find({ user: userId }).lean();
  if (!subs.length) return;

  // ✅ FIX: Enforce strict payload size limit (Web Push max is ~4KB, keep it under 1KB for safety)
  let payloadString = JSON.stringify({ title, body, url, tag });
  if (payloadString.length > 1000) {
    console.warn(
      `⚠️ Push payload too large (${payloadString.length} bytes). Truncating body.`
    );
    payloadString = JSON.stringify({
      title,
      body: body.substring(0, 100) + "...",
      url,
      tag,
    });
  }

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payloadString
        );
      } catch (err) {
        // ✅ FIX: Handle specific Web Push error codes properly
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription is no longer valid (user cleared browser data or unsubscribed)
          await PushSubscription.deleteOne({ endpoint: sub.endpoint }).catch(
            () => {}
          );
        } else if (err.statusCode === 429) {
          console.warn(
            `⚠️ Push rate limited by service for endpoint: ${sub.endpoint}`
          );
        } else if (err.statusCode === 400 || err.statusCode === 401) {
          console.warn(
            `❌ Push auth/format error (${err.statusCode}) for endpoint: ${sub.endpoint}`
          );
        } else {
          // Network errors or 5xx from push service
          console.warn(
            `⚠️ Push failed for endpoint ${sub.endpoint}: ${err.message}`
          );
        }
      }
    })
  );
};

/**
 * Send to MANY users with concurrency control (prevents server crash/IP bans)
 */
export const sendPushToMany = async (userIds, payload, batchSize = 50) => {
  if (!userIds || userIds.length === 0) return;

  const unique = [...new Set(userIds.map(String))];

  // ✅ FIX: Process in batches to prevent event loop blocking and network exhaustion
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.allSettled(batch.map((id) => sendPush(id, payload)));
  }
};

/**
 * Skip push if user is currently ONLINE (connected via WebSocket)
 */
export const sendPushIfOffline = async (userId, payload) => {
  try {
    // ✅ FIX: Removed weird `getIORef` parameter workaround. Just use the imported `getIO`.
    const io = getIO();
    if (io) {
      const sockets = await io.in(`user:${userId.toString()}`).fetchSockets();
      if (sockets.length > 0) return; // User is online, skip push
    }
  } catch {
    // If socket server isn't initialized, just send the push
  }
  await sendPush(userId, payload);
};

/**
 * Get all ACTIVE match IDs for a user (for broadcasting profile updates, etc.)
 */
export const getMatchIds = async (userId) => {
  // ✅ FIX: Only fetch ACTIVE matches (ignore unmatched/soft-deleted)
  const matches = await Match.find({
    users: userId,
    isActive: { $ne: false },
  })
    .select("users")
    .lean();

  const me = userId.toString();
  return matches
    .flatMap((m) => m.users.map((u) => u.toString()))
    .filter((id) => id !== me);
};
