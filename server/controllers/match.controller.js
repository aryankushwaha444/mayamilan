import mongoose from "mongoose";
import Match from "../models/Match.js";
import Like from "../models/Like.js";
import { getIO } from "../sockets/socket.js";

/*
|--------------------------------------------------------------------------
| GET ALL MATCHES
|--------------------------------------------------------------------------
*/
export const getMatches = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const matches = await Match.find({
      users: currentUserId,
    })
      .populate(
        "users",
        "_id name dateOfBirth gender photos location occupation"
      )
      .sort({ matchedAt: -1 });

    const formattedMatches = matches
      .map((match) => {
        const matchedUser = match.users.find(
          (user) => user._id.toString() !== currentUserId.toString()
        );

        if (!matchedUser) return null;

        return {
          _id: match._id,
          matchedAt: match.matchedAt,
          user: matchedUser,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      count: formattedMatches.length,
      matches: formattedMatches,
    });
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| GET SINGLE MATCH
|--------------------------------------------------------------------------
*/
export const getMatchById = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid match ID" });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: currentUserId,
    }).populate(
      "users",
      "_id name dateOfBirth gender photos location occupation"
    );

    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    const matchedUser = match.users.find(
      (user) => user._id.toString() !== currentUserId.toString()
    );

    if (!matchedUser) {
      return res
        .status(404)
        .json({ success: false, message: "Matched user not found" });
    }

    return res.status(200).json({
      success: true,
      match: {
        _id: match._id,
        matchedAt: match.matchedAt,
        user: matchedUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| UNMATCH (DELETE MATCH)
|--------------------------------------------------------------------------
*/
export const deleteMatch = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid match ID" });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: currentUserId,
    });

    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    // Find the other user's ID
    const otherUserId = match.users.find(
      (userId) => userId.toString() !== currentUserId.toString()
    );

    // 1. Delete the match document
    await Match.deleteOne({ _id: matchId });

    // 2. 👈 ONLY delete the current user's like.
    // The other user's like remains intact in the database.
    await Like.deleteOne({
      from: currentUserId,
      to: otherUserId,
    });

    console.log(
      `MATCH DELETED & LIKE REMOVED: ${currentUserId} -> ${otherUserId} (Other user's like preserved)`
    );

    // 3. Emit real-time event to BOTH users
    const io = getIO();
    if (io) {
      const payload = {
        matchId: match._id,
        userId: otherUserId.toString(),
        unmatchedBy: currentUserId.toString(), // Tells the receiver who initiated it
      };

      io.to(`user:${currentUserId}`).emit("match_removed", payload);
      io.to(`user:${otherUserId}`).emit("match_removed", payload);
    }

    return res.status(200).json({
      success: true,
      message: "Unmatched successfully",
    });
  } catch (error) {
    next(error);
  }
};
