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

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Split array into chunks for batch processing
 */
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// ═══════════════════════════════════════════
// MAIN CRON JOB
// ═══════════════════════════════════════════

export const cleanupDeletedAccounts = async () => {
  try {
    const now = new Date();

    // Find accounts past their 15-day grace period
    const expiredAccounts = await User.find({
      deletedAt: { $ne: null },
      scheduledDeletionAt: { $lt: now },
    });

    if (expiredAccounts.length === 0) {
      console.log("✅ No accounts pending permanent deletion.");
      return;
    }

    console.log(
      `🗑️ Found ${expiredAccounts.length} accounts to permanently anonymize/delete`
    );

    for (const user of expiredAccounts) {
      try {
        console.log(
          `⏳ Processing permanent deletion for: ${user.email} (ID: ${user._id})`
        );

        // ═══════════════════════════════════════════
        // 1. BATCH DELETE CLOUDINARY ASSETS
        // ═══════════════════════════════════════════
        const userPosts = await Post.find({ author: user._id })
          .select("images")
          .lean();
        const postPublicIds = userPosts.flatMap(
          (p) => p.images?.map((img) => img.publicId) || []
        );
        const profilePublicIds = user.photos?.map((p) => p.publicId) || [];

        const allPublicIds = [...postPublicIds, ...profilePublicIds].filter(
          Boolean
        );

        // ✅ FIX: Batch delete (max 100 per request) instead of slow sequential loops
        if (allPublicIds.length > 0) {
          const chunks = chunkArray(allPublicIds, 100);
          for (const chunk of chunks) {
            await cloudinary.api
              .delete_resources(chunk, { resource_type: "image" })
              .catch(() => {});
          }
        }

        // ═══════════════════════════════════════════
        // 2. ANONYMIZE POSTS & COMMENTS (Preserves thread integrity)
        // ═══════════════════════════════════════════
        await Post.updateMany(
          { author: user._id },
          { $set: { isDeleted: true, content: "[deleted]", images: [] } }
        );

        await Comment.updateMany(
          { author: user._id },
          { $set: { isDeleted: true, content: "[deleted]", reactions: [] } }
        );

        // ═══════════════════════════════════════════
        // 3. ANONYMIZE MESSAGES (DO NOT hard-delete)
        // ═══════════════════════════════════════════
        // ✅ FIX: Only wipe messages SENT by the deleted user.
        // Messages they RECEIVED belong to the sender's history and must be preserved.
        await Message.updateMany(
          { sender: user._id },
          { $set: { deletedForEveryone: true, text: "", type: "system" } }
        );

        // ═══════════════════════════════════════════
        // 4. HANDLE CONVERSATIONS
        // ═══════════════════════════════════════════
        // ✅ FIX: Hide from deleted user, but leave intact for the other participant
        await Conversation.updateMany(
          { participants: user._id },
          { $set: { isActive: false }, $addToSet: { hiddenBy: user._id } }
        );

        // ═══════════════════════════════════════════
        // 5. HARD DELETE RELATIONAL DATA
        // ═══════════════════════════════════════════
        await Promise.all([
          Match.deleteMany({ users: user._id }),
          Share.deleteMany({
            $or: [{ sharedBy: user._id }, { sharedTo: user._id }],
          }),
          Like.deleteMany({ $or: [{ from: user._id }, { to: user._id }] }),
          Notification.deleteMany({
            $or: [{ recipient: user._id }, { sender: user._id }],
          }),
          RefreshToken.deleteMany({ user: user._id }),
        ]);

        // ═══════════════════════════════════════════
        // 6. HANDLE REPORTS (Preserve Abuse Audit Trail)
        // ═══════════════════════════════════════════
        // ✅ FIX: Anonymize reports MADE by the user
        await Report.updateMany(
          { reporter: user._id },
          { $set: { reporter: null, message: "Reporter account deleted" } }
        );
        // ✅ FIX: DO NOT delete reports where reportedUser: user._id.
        // Admins need to retain evidence of abuse/harassment even if the user deletes their account.

        // ═══════════════════════════════════════════
        // 7. GDPR COMPLIANCE: ANONYMIZE USER PII
        // ═══════════════════════════════════════════
        // We keep the document alive ONLY to enforce the 30-day email re-registration block.
        user.name = "Deleted User";
        // Note: We MUST keep user.email intact so the registration controller can check emailBlockedUntil
        user.bio = "";
        user.occupation = "";
        user.education = "";
        user.interests = [];
        user.relationshipGoal = "";
        user.location = { city: "", country: "", coordinates: [0, 0] };
        user.photos = [];
        user.dateOfBirth = null;
        user.gender = "other";
        user.oauthProvider = "deleted";
        user.isVerified = false;
        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        user.twoFactorBackupCodes = [];
        user.preferences = {};
        user.blockedUsers = [];
        user.hiddenConversations = [];

        // Set the 30-day block and clear deletion flags
        user.emailBlockedUntil = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        user.isActive = false;
        user.deletedAt = null;
        user.scheduledDeletionAt = null;

        await user.save();

        console.log(
          `✅ Account ${user._id} permanently anonymized and email blocked for 30 days`
        );
      } catch (err) {
        console.error(`❌ Failed to process account ${user._id}:`, err);
      }
    }

    console.log(
      `🏁 Cleanup complete: ${expiredAccounts.length} accounts processed`
    );
  } catch (error) {
    console.error("Cleanup cron error:", error);
  }
};
