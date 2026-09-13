import webPush from "web-push";
import PushSubscription from "../models/PushSubscription.js";
import Match from "../models/Match.js";
import { getIO } from "../sockets/socket.js"; // 👈 CORRECT path (not ../socket/index.js)

if (process.env.VAPID_PUBLIC_KEY) {
  webPush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || "rupnarayan444@gmail.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/* Send to ONE user */
export const sendPush = async (
  userId,
  { title, body, url = "/notifications", tag }
) => {
  if (!process.env.VAPID_PUBLIC_KEY || !userId) return;

  const subs = await PushSubscription.find({ user: userId }).lean();
  if (!subs.length) return;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title, body, url, tag })
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint });
        }
      }
    })
  );
};

/* Send to MANY users */
export const sendPushToMany = async (userIds, payload) => {
  const unique = [...new Set(userIds.map(String))];
  await Promise.allSettled(unique.map((id) => sendPush(id, payload)));
};

/* Skip push if user is ONLINE right now */
export const sendPushIfOffline = async (userId, payload, getIORef) => {
  try {
    const io = (getIORef && getIORef()) || getIO();
    if (io) {
      const sockets = await io.in(`user:${userId.toString()}`).fetchSockets();
      if (sockets.length > 0) return;
    }
  } catch {}
  await sendPush(userId, payload);
};

/* All match IDs of a user */
export const getMatchIds = async (userId) => {
  const matches = await Match.find({ users: userId }).select("users").lean();
  const me = userId.toString();
  return matches
    .flatMap((m) => m.users.map((u) => u.toString()))
    .filter((id) => id !== me);
};
