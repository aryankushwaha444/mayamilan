import mongoose from "mongoose";

const shareSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sharedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// 👇 Same person can't share same post twice to same match
shareSchema.index({ post: 1, sharedBy: 1, sharedTo: 1 }, { unique: true });

export default mongoose.model("Share", shareSchema);
