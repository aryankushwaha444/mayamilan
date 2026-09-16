import User from "../models/User.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Message from "../models/Message.js";
import Match from "../models/Match.js";
import Share from "../models/Share.js";
import Notification from "../models/Notification.js";
import RefreshToken from "../models/RefreshToken.js";
import Like from "../models/Like.js";
import Report from "../models/Report.js";
import Conversation from "../models/Conversation.js";
import { v2 as cloudinary } from "cloudinary";

export const cleanupDeletedAccounts = async () => {
  try {
    const now = new Date();

    const expiredAccounts = await User.find({
      deletedAt: { $ne: null },
      scheduledDeletionAt: { $lt: now },
    });

    console.log(
      `🗑️ Found ${expiredAccounts.length} accounts to permanently delete`
    );

    for (const user of expiredAccounts) {
      try {
        console.log(`Deleting account: ${user.email} (ID: ${user._id})`);

        // 1. Delete posts and Cloudinary images
        const userPosts = await Post.find({ author: user._id });
        for (const post of userPosts) {
          for (const img of post.images || []) {
            if (img.publicId) {
              await cloudinary.uploader.destroy(img.publicId).catch(() => {});
            }
          }
        }
        await Post.deleteMany({ author: user._id });

        // 2. Delete comments
        const userComments = await Comment.find({ author: user._id });
        const commentIds = userComments.map((c) => c._id);
        await Comment.deleteMany({
          $or: [{ author: user._id }, { parent: { $in: commentIds } }],
        });

        // 3. Delete messages and conversations
        await Message.deleteMany({
          $or: [{ sender: user._id }, { receiver: user._id }],
        });
        await Conversation.deleteMany({ participants: user._id });

        // 4. Delete matches
        await Match.deleteMany({ users: user._id });

        // 5. Delete shares
        await Share.deleteMany({
          $or: [{ sharedBy: user._id }, { sharedTo: user._id }],
        });

        // 6. Delete likes
        await Like.deleteMany({
          $or: [{ from: user._id }, { to: user._id }],
        });

        // 7. Delete notifications
        await Notification.deleteMany({
          $or: [{ recipient: user._id }, { sender: user._id }],
        });

        // 8. Delete reports
        await Report.deleteMany({
          $or: [{ reporter: user._id }, { reportedUser: user._id }],
        });

        // 9. Delete refresh tokens
        await RefreshToken.deleteMany({ user: user._id });

        // 10. Delete profile photos from Cloudinary
        for (const photo of user.photos || []) {
          if (photo.publicId) {
            await cloudinary.uploader.destroy(photo.publicId).catch(() => {});
          }
        }

        // 11. Block email from re-registration for 30 days
        user.emailBlockedUntil = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        user.isActive = false;
        user.deletedAt = null;
        user.scheduledDeletionAt = null;
        await user.save();

        console.log(
          `✅ Account ${user.email} permanently deleted and email blocked for 30 days`
        );
      } catch (err) {
        console.error(`❌ Failed to delete account ${user.email}:`, err);
      }
    }

    console.log(
      `✅ Cleanup complete: ${expiredAccounts.length} accounts processed`
    );
  } catch (error) {
    console.error("Cleanup error:", error);
  }
};
