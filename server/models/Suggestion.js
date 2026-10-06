import mongoose from "mongoose";
const suggestionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    category: {
      type: String,
      enum: ["general", "feature", "bug", "improvement", "security", "other"],
      default: "general",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Subject cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [5000, "Message cannot exceed 5000 characters"],
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "planned", "resolved", "rejected"],
      default: "new",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    adminNotes: { type: String, trim: true, maxlength: 2000, default: "" },
  },
  { timestamps: true }
);

suggestionSchema.index({ status: 1, priority: 1, createdAt: -1 });
suggestionSchema.index({ user: 1, createdAt: -1 });
suggestionSchema.index({
  subject: "text",
  message: "text",
  name: "text",
  email: "text",
});

export default mongoose.model("Suggestion", suggestionSchema);
