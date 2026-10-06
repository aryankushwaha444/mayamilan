import User from "../models/User.js";
import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import Match from "../models/Match.js";
import Like from "../models/Like.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Notification from "../models/Notification.js";
import Report from "../models/Report.js";
import Share from "../models/Share.js";
import RefreshToken from "../models/RefreshToken.js";
import AuditLog from "../models/AuditLog.js";
import OTP from "../models/OTP.js";
import cloudinary from "../utils/cloudinary.js";

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const BATCH_SIZE = 10; // Process users in batches
const CLOUDINARY_BATCH_SIZE = 20; // Parallel Cloudinary deletions
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Mask email for logging (privacy protection)
 */
const maskEmail = (email) => {
  if (!email) return "****@****";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "****@****";
  return `${local.slice(0, 2)}****@${domain}`;
};

/**
 * Sleep helper for retry delays
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delete Cloudinary assets in parallel batches
 */
const deleteCloudinaryAssets = async (publicIds) => {
  if (!publicIds || publicIds.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  // Process in batches to avoid API rate limits
  for (let i = 0; i < publicIds.length; i += CLOUDINARY_BATCH_SIZE) {
    const batch = publicIds.slice(i, i + CLOUDINARY_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((publicId) =>
        cloudinary.uploader.destroy(publicId).catch(() => null)
      )
    );

    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        success++;
      } else {
        failed++;
      }
    });

    // Small delay between batches to respect rate limits
    if (i + CLOUDINARY_BATCH_SIZE < publicIds.length) {
      await sleep(100);
    }
  }

  return { success, failed };
};

/**
 * Delete a single user and all associated data
 */
const deleteUserData = async (user) => {
  const userId = user._id;
  const stats = {
    cloudinaryDeleted: 0,
    cloudinaryFailed: 0,
    postsDeleted: 0,
    commentsDeleted: 0,
    messagesDeleted: 0,
    matchesDeleted: 0,
    likesDeleted: 0,
    conversationsDeleted: 0,
    notificationsDeleted: 0,
    reportsDeleted: 0,
    sharesDeleted: 0,
    refreshTokensDeleted: 0,
  };

  // ═══════════════════════════════════════════
  // STEP 1: Collect all Cloudinary public IDs
  // ═══════════════════════════════════════════
  const publicIds = [];

  // Profile photos
  if (user.photos && user.photos.length > 0) {
    user.photos.forEach((photo) => {
      if (photo.publicId) publicIds.push(photo.publicId);
    });
  }

  // Post images
  const posts = await Post.find({ author: userId }).select("images").lean();
  posts.forEach((post) => {
    if (post.images && post.images.length > 0) {
      post.images.forEach((img) => {
        if (img.publicId) publicIds.push(img.publicId);
      });
    }
  });

  // ═══════════════════════════════════════════
  // STEP 2: Delete Cloudinary assets in parallel
  // ═══════════════════════════════════════════
  if (publicIds.length > 0) {
    const result = await deleteCloudinaryAssets(publicIds);
    stats.cloudinaryDeleted = result.success;
    stats.cloudinaryFailed = result.failed;
  }

  // ═══════════════════════════════════════════
  // STEP 3: Delete all database records
  // ═══════════════════════════════════════════
  const [
    postsResult,
    commentsResult,
    messagesResult,
    matchesResult,
    likesResult,
    conversationsResult,
    notificationsResult,
    reportsResult,
    sharesResult,
    refreshTokensResult,
    otpsResult,
  ] = await Promise.all([
    Post.deleteMany({ author: userId }),
    Comment.deleteMany({ author: userId }),
    Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
    Match.deleteMany({ users: userId }),
    Like.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    Conversation.deleteMany({ participants: userId }),
    Notification.deleteMany({
      $or: [{ recipient: userId }, { sender: userId }],
    }),
    Report.deleteMany({
      $or: [{ reporter: userId }, { reportedUser: userId }],
    }),
    Share.deleteMany({
      $or: [{ sharedBy: userId }, { sharedTo: userId }],
    }),
    RefreshToken.deleteMany({ user: userId }),
    OTP.deleteMany({ email: user.email }),
  ]);

  stats.postsDeleted = postsResult.deletedCount;
  stats.commentsDeleted = commentsResult.deletedCount;
  stats.messagesDeleted = messagesResult.deletedCount;
  stats.matchesDeleted = matchesResult.deletedCount;
  stats.likesDeleted = likesResult.deletedCount;
  stats.conversationsDeleted = conversationsResult.deletedCount;
  stats.notificationsDeleted = notificationsResult.deletedCount;
  stats.reportsDeleted = reportsResult.deletedCount;
  stats.sharesDeleted = sharesResult.deletedCount;
  stats.refreshTokensDeleted = refreshTokensResult.deletedCount;

  // ═══════════════════════════════════════════
  // STEP 4: Delete user document last
  // ═══════════════════════════════════════════
  await User.deleteOne({ _id: userId });

  // ═══════════════════════════════════════════
  // STEP 5: Log deletion to audit trail
  // ═══════════════════════════════════════════
  await AuditLog.create({
    action: "account_permanently_deleted",
    userId,
    email: user.email,
    metadata: {
      scheduledDeletionAt: user.scheduledDeletionAt,
      deletedAt: new Date(),
      stats,
    },
    ip: "system",
    userAgent: "cron-job",
  }).catch(() => {
    // Audit log failure shouldn't block deletion
  });

  return stats;
};

/**
 * Permanently delete accounts past grace period.
 * Run daily via cron job.
 */
export const cleanupDeletedAccounts = async (options = {}) => {
  const { dryRun = false, verbose = false } = options;
  const now = new Date();
  const startTime = Date.now();

  const metrics = {
    totalProcessed: 0,
    totalDeleted: 0,
    totalFailed: 0,
    cloudinaryDeleted: 0,
    cloudinaryFailed: 0,
    errors: [],
  };

  try {
    // Find users past grace period
    const query = {
      deletedAt: { $ne: null },
      scheduledDeletionAt: { $lte: now },
    };

    const usersToDelete = await User.find(query)
      .select("email photos scheduledDeletionAt deletedAt")
      .lean();

    if (usersToDelete.length === 0) {
      if (verbose) {
        // Use structured logging instead of console
        await AuditLog.create({
          action: "cleanup_job_completed",
          metadata: { usersProcessed: 0, reason: "no_accounts_to_delete" },
          ip: "system",
          userAgent: "cron-job",
        }).catch(() => {});
      }
      return metrics;
    }

    if (dryRun) {
      if (verbose) {
        console.log(`[DRY RUN] Would delete ${usersToDelete.length} accounts`);
      }
      return { ...metrics, totalProcessed: usersToDelete.length };
    }

    // Process users in batches
    for (let i = 0; i < usersToDelete.length; i += BATCH_SIZE) {
      const batch = usersToDelete.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (user) => {
          let retries = 0;
          let lastError = null;

          while (retries < MAX_RETRIES) {
            try {
              const stats = await deleteUserData(user);
              return { success: true, userId: user._id, stats };
            } catch (error) {
              lastError = error;
              retries++;
              if (retries < MAX_RETRIES) {
                await sleep(RETRY_DELAY_MS * retries);
              }
            }
          }

          return {
            success: false,
            userId: user._id,
            email: user.email,
            error: lastError?.message || "Unknown error",
          };
        })
      );

      // Process results
      results.forEach((result) => {
        metrics.totalProcessed++;

        if (result.status === "fulfilled" && result.value.success) {
          metrics.totalDeleted++;
          metrics.cloudinaryDeleted += result.value.stats.cloudinaryDeleted;
          metrics.cloudinaryFailed += result.value.stats.cloudinaryFailed;
        } else {
          metrics.totalFailed++;
          const error =
            result.status === "fulfilled"
              ? result.value
              : { error: result.reason };
          metrics.errors.push({
            userId: error.userId,
            email: maskEmail(error.email),
            error: error.error,
          });
        }
      });
    }

    // Log job completion
    const duration = Date.now() - startTime;

    await AuditLog.create({
      action: "cleanup_job_completed",
      metadata: {
        duration,
        ...metrics,
        errors: metrics.errors.slice(0, 10), // Limit stored errors
      },
      ip: "system",
      userAgent: "cron-job",
    }).catch(() => {});

    return metrics;
  } catch (error) {
    await AuditLog.create({
      action: "cleanup_job_failed",
      metadata: {
        error: error.message,
        stack: error.stack,
      },
      ip: "system",
      userAgent: "cron-job",
    }).catch(() => {});

    throw error;
  }
};

/**
 * Get cleanup job statistics (for admin dashboard)
 */
export const getCleanupStats = async () => {
  const now = new Date();

  const [pendingDeletion, scheduledToday, scheduledThisWeek, lastJob] =
    await Promise.all([
      User.countDocuments({
        deletedAt: { $ne: null },
        scheduledDeletionAt: { $gt: now },
      }),
      User.countDocuments({
        deletedAt: { $ne: null },
        scheduledDeletionAt: {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lte: new Date(now.setHours(23, 59, 59, 999)),
        },
      }),
      User.countDocuments({
        deletedAt: { $ne: null },
        scheduledDeletionAt: {
          $gte: now,
          $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
      AuditLog.findOne({ action: "cleanup_job_completed" })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

  return {
    pendingDeletion,
    scheduledToday,
    scheduledThisWeek,
    lastJob: lastJob
      ? {
          completedAt: lastJob.createdAt,
          usersProcessed: lastJob.metadata?.totalProcessed || 0,
          usersDeleted: lastJob.metadata?.totalDeleted || 0,
          usersFailed: lastJob.metadata?.totalFailed || 0,
          duration: lastJob.metadata?.duration || 0,
        }
      : null,
  };
};
