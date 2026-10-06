import mongoose from "mongoose";
const ALLOWED_EMOJIS = [
  "❤️",
  "👍",
  "👎",
  "😂",
  "😮",
  "😢",
  "🔥",
  "🎉",
  "👏",
  "🤔",
];

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
    },
    reactions: [
      {
        _id: false,
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        emoji: { type: String, required: true, enum: ALLOWED_EMOJIS },
      },
    ],
    reactionsCount: { type: Number, default: 0 },
    repliesCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, parent: 1, createdAt: -1 });
commentSchema.index({ parent: 1, createdAt: 1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ isDeleted: 1, deletedAt: 1 });

commentSchema.pre("save", function () {
  if (this.isModified("reactions")) {
    const seenUsers = new Set();
    this.reactions = this.reactions.filter((reaction) => {
      const userIdStr = reaction.user.toString();
      if (seenUsers.has(userIdStr)) return false;
      seenUsers.add(userIdStr);
      return true;
    });
    this.reactionsCount = this.reactions.length;
  }
});

commentSchema.methods.hasReacted = function (userId, emoji = null) {
  if (!userId) return false;
  const userIdStr = userId.toString();
  return this.reactions.some(
    (r) => r.user.toString() === userIdStr && (!emoji || r.emoji === emoji)
  );
};

export default mongoose.model("Comment", commentSchema);
