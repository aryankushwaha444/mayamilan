import mongoose from "mongoose";
const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["profile", "message", "post", "photo", "comment"],
      required: true,
      default: "profile",
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reason: {
      type: String,
      enum: [
        "harassment",
        "inappropriate",
        "fake_profile",
        "spam",
        "scam",
        "underage",
        "hate_speech",
        "other",
      ],
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: [1000, "Report details cannot exceed 1000 characters"],
      default: "",
    },
    evidence: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "reviewing", "resolved", "dismissed"],
      default: "pending",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    adminNotes: { type: String, trim: true, maxlength: 500, default: "" },
    actionTaken: {
      type: String,
      enum: ["none", "warning_sent", "content_deleted", "suspend", "ban"],
      default: null,
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

export default mongoose.model("Report", reportSchema);
