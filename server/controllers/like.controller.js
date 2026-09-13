import mongoose from "mongoose";
import User from "../models/User.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";
import { getIO } from "../sockets/socket.js";
import Notification from "../models/Notification.js";
import { sendPushIfOffline, sendPush } from "../utils/push.js";

// LIKE USER
// POST /api/likes/:userId
export const likeUser = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // Cannot like yourself
    if (currentUserId.toString() === targetUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot like yourself",
      });
    }

    // Check target user
    const targetUser = await User.findOne({
      _id: targetUserId,
      isActive: true,
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if current user already liked target
    const existingLike = await Like.findOne({
      from: currentUserId,
      to: targetUserId,
    });

    if (existingLike) {
      return res.status(400).json({
        success: false,
        message: "You already liked this user",
        alreadyLiked: true,
      });
    }

    // Create like
    const like = await Like.create({
      from: currentUserId,
      to: targetUserId,
    });

    await Notification.create({
      recipient: targetUserId,
      sender: currentUserId,
      type: "like",
      message: "liked your profile",
      isRead: false,
    });

    const io = getIO();
    if (io) {
      io.to(`user:${targetUserId}`).emit("new_notification", {
        type: "like",
        senderId: currentUserId,
      });
    }

    const liker = await User.findById(currentUserId).select("name");
    sendPushIfOffline(
      targetUserId,
      {
        title: `${liker?.name || "Someone"} liked you ❤️`,
        body: "Tap to view their profile",
        url: `/users/${currentUserId}`,
      },
      getIO
    );

    // Check reciprocal like
    const mutualLike = await Like.findOne({
      from: targetUserId,
      to: currentUserId,
    });

    // Not mutual yet
    if (!mutualLike) {
      return res.status(201).json({
        success: true,
        liked: true,
        matched: false,
        message: "Like sent successfully",
        likeId: like._id,
      });
    }

    // Create a unique pair key
    const sortedIds = [
      currentUserId.toString(),
      targetUserId.toString(),
    ].sort();
    const pairKey = `${sortedIds[0]}_${sortedIds[1]}`;
    const userIds = sortedIds.map((id) => new mongoose.Types.ObjectId(id));

    // Find existing match
    let match = await Match.findOne({ pairKey });
    let newMatch = false;

    // Create match if it does not exist
    if (!match) {
      match = await Match.create({
        users: userIds,
        pairKey,
        matchedAt: new Date(),
      });

      newMatch = true;

      // EMIT REAL-TIME EVENT TO BOTH USERS
      const io = getIO();
      if (io) {
        io.to(`user:${currentUserId}`).emit("new_match", {
          matchId: match._id,
        });
        io.to(`user:${targetUserId}`).emit("new_match", { matchId: match._id });
      }

      // 👇 PUSH: "It's a Match!" to BOTH users
      const me = await User.findById(currentUserId).select("name");
      const them = await User.findById(targetUserId).select("name");
      sendPush(currentUserId, {
        title: "It's a Match! 💕",
        body: `You and ${them?.name || "someone"} liked each other`,
        url: `/messages?matchId=${match._id}`,
      });
      sendPush(targetUserId, {
        title: "It's a Match! 💕",
        body: `You and ${me?.name || "someone"} liked each other`,
        url: `/messages?matchId=${match._id}`,
      });
    } // 👈 REMOVED extra closing brace that was here

    // Populate users
    await match.populate(
      "users",
      "name dateOfBirth gender photos location occupation"
    );

    return res.status(201).json({
      success: true,
      liked: true,
      matched: true,
      newMatch,
      message: newMatch ? "It's a match!" : "You are already matched!",
      likeId: like._id,
      matchId: match._id,
      match,
    });
  } catch (error) {
    console.error("LIKE USER ERROR:", error);
    next(error);
  }
};

// UNLIKE USER
// DELETE /api/likes/:userId
export const unlikeUser = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const targetUserId = req.params.userId;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // Delete current user's like
    const deletedLike = await Like.findOneAndDelete({
      from: currentUserId,
      to: targetUserId,
    });
    if (!deletedLike) {
      return res.status(404).json({
        success: false,
        message: "Like not found",
      });
    }

    // Generate same pair key
    const sortedIds = [
      currentUserId.toString(),
      targetUserId.toString(),
    ].sort();
    const pairKey = `${sortedIds[0]}_${sortedIds[1]}`;

    // Find match
    const match = await Match.findOne({ pairKey });

    // Delete match immediately
    if (match) {
      await Match.deleteOne({ _id: match._id });

      // EMIT REAL-TIME EVENT TO BOTH USERS
      const io = getIO();
      if (io) {
        io.to(`user:${currentUserId}`).emit("match_removed", {
          matchId: match._id,
        });
        io.to(`user:${targetUserId}`).emit("match_removed", {
          matchId: match._id,
        });
      }
    }

    return res.status(200).json({
      success: true,
      liked: false,
      unmatched: Boolean(match),
      message: match
        ? "Like removed and match removed"
        : "Like removed successfully",
    });
  } catch (error) {
    console.error("UNLIKE USER ERROR:", error);
    next(error);
  }
};

// GET SENT LIKES
// GET /api/likes/sent
export const getSentLikes = async (req, res, next) => {
  try {
    const likes = await Like.find({ from: req.user._id })
      .populate("to", "name dateOfBirth gender photos location occupation")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: likes.length,
      likes,
    });
  } catch (error) {
    next(error);
  }
};

// GET RECEIVED LIKES
// GET /api/likes/received
export const getReceivedLikes = async (req, res, next) => {
  try {
    const likes = await Like.find({ to: req.user._id })
      .populate("from", "name dateOfBirth gender photos location occupation")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: likes.length,
      likes,
    });
  } catch (error) {
    next(error);
  }
};
