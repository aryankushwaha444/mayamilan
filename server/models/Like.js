import mongoose from "mongoose";

const likeSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["standard", "super", "boosted"],
      default: "standard",
    },
    isHidden: { type: Boolean, default: false },
    resultedInMatch: { type: Boolean, default: false },
  },
  { timestamps: true }
);

likeSchema.index({ from: 1, to: 1 }, { unique: true });
likeSchema.index({ to: 1, createdAt: -1 });
likeSchema.index({ from: 1, createdAt: -1 });
likeSchema.index({ resultedInMatch: 1, createdAt: -1 });

likeSchema.pre("save", async function () {
  if (this.from && this.to && this.from.toString() === this.to.toString()) {
    const error = new Error("Users cannot like themselves");
    error.name = "ValidationError";
    throw error;
  }
});

likeSchema.statics.checkMutualLike = async function (userIdA, userIdB) {
  const count = await this.countDocuments({
    $or: [
      { from: userIdA, to: userIdB },
      { from: userIdB, to: userIdA },
    ],
  });
  return count === 2;
};

likeSchema.statics.getUnreadLikesCount = async function (
  userId,
  matchedUserIds = []
) {
  return this.countDocuments({
    to: userId,
    from: { $nin: matchedUserIds },
    isHidden: false,
  });
};

export default mongoose.model("Like", likeSchema);
