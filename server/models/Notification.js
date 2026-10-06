import mongoose from "mongoose";
const NOTIFICATION_TYPES = [
  "like",
  "match",
  "message",
  "comment",
  "reaction",
  "profile_view",
  "follow",
  "system",
  "marketing",
  "premium",
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, trim: true, maxlength: 100, default: "" },
    message: { type: String, trim: true, maxlength: 500, required: true },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: () => new Map(),
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $ne: null } },
  }
);

notificationSchema.pre("save", async function () {
  if (this.isModified("isRead") && this.isRead && !this.readAt)
    this.readAt = new Date();
});

notificationSchema.statics.markAllAsRead = async function (userId) {
  const result = await this.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return result.modifiedCount;
};

notificationSchema.statics.getUnreadCount = async function (userId) {
  return this.countDocuments({ recipient: userId, isRead: false });
};

// ✅ FIXED: Optimized cleanup to avoid slow skip() on large datasets
notificationSchema.statics.cleanupOldNotifications = async function (
  userId,
  keepCount = 100
) {
  const thresholdDoc = await this.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .skip(keepCount)
    .limit(1)
    .select("createdAt")
    .lean();
  if (thresholdDoc.length > 0) {
    await this.deleteMany({
      recipient: userId,
      createdAt: { $lt: thresholdDoc[0].createdAt },
    });
  }
};

export default mongoose.model("Notification", notificationSchema);
