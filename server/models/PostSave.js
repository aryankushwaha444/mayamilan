import mongoose from "mongoose";
const postSaveSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
postSaveSchema.index({ post: 1, user: 1 }, { unique: true });
postSaveSchema.index({ user: 1, createdAt: -1 });
export default mongoose.model("PostSave", postSaveSchema);
