import mongoose from "mongoose";

const suggestionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    category: {
      type: String,
      enum: ["general", "feature", "bug", "improvement", "other"],
      default: "general",
    },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      enum: ["new", "reviewed", "resolved"],
      default: "new",
    },
  },
  { timestamps: true }
);

suggestionSchema.index({ createdAt: -1 });
suggestionSchema.index({ status: 1 });

const Suggestion = mongoose.model("Suggestion", suggestionSchema);
export default Suggestion;
