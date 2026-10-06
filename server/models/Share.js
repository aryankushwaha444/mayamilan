import mongoose from "mongoose";
const shareSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sharedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    platform: {
      type: String,
      enum: [
        "in_app",
        "whatsapp",
        "twitter",
        "facebook",
        "instagram",
        "sms",
        "copy_link",
        "other",
      ],
      default: "in_app",
    },
    trackingId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

shareSchema.index({ sharedTo: 1, createdAt: -1 });
shareSchema.index({ post: 1, createdAt: -1 });
shareSchema.index({ sharedBy: 1, createdAt: -1 });
shareSchema.index(
  { post: 1, sharedBy: 1, sharedTo: 1 },
  { unique: true, partialFilterExpression: { sharedTo: { $ne: null } } }
);

export default mongoose.model("Share", shareSchema);
