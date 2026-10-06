import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    users: {
      type: [
        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      ],
      validate: {
        validator: function (v) {
          return v.length === 2;
        },
        message: "A match must contain exactly two users.",
      },
      _id: false,
    },
    pairKey: { type: String, required: true, unique: true },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    matchedAt: { type: Date, default: Date.now, index: true },
    isSuperMatch: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    unmatchedAt: { type: Date, default: null },
    unmatchedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

matchSchema.index({ users: 1, isActive: 1, matchedAt: -1 });
matchSchema.index({ unmatchedBy: 1, unmatchedAt: -1 }, { sparse: true });
matchSchema.index({ isActive: 1, updatedAt: 1 });

matchSchema.pre("save", async function () {
  if (this.isModified("users") && this.users.length === 2) {
    this.users.sort((a, b) => a.toString().localeCompare(b.toString()));
    if (!this.pairKey)
      this.pairKey = `${this.users[0].toString()}_${this.users[1].toString()}`;
  }
});

matchSchema.statics.checkActiveMatch = async function (userIdA, userIdB) {
  const sorted = [userIdA.toString(), userIdB.toString()].sort();
  const pairKey = `${sorted[0]}_${sorted[1]}`;
  const match = await this.findOne({ pairKey, isActive: true }).lean();
  return !!match;
};

matchSchema.statics.getMatchCount = async function (userId) {
  return this.countDocuments({ users: userId, isActive: true });
};

export default mongoose.model("Match", matchSchema);
