import mongoose from "mongoose";

const ALLOWED_MESSAGE_TYPES = [
  "text",
  "image",
  "gif",
  "sticker",
  "voice",
  "heart",
  "post",
  "system",
];
const ALLOWED_REACTION_EMOJIS = [
  "❤️",
  "😂",
  "😮",
  "😢",
  "🔥",
  "👍",
  "👎",
  "🎉",
  "👏",
  "🤔",
];

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    // ✅ FIXED: optional — GIFs/external media have no Cloudinary publicId
    publicId: { type: String, default: null },
    mimeType: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    size: { type: Number, default: null },
    duration: { type: Number, default: 0 },
    thumbnailUrl: { type: String, default: null },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
      default: "",
    },
    type: { type: String, enum: ALLOWED_MESSAGE_TYPES, default: "text" },
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    attachment: { type: attachmentSchema, default: null },
    reactions: [
      {
        _id: false,
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        emoji: { type: String, required: true, enum: ALLOWED_REACTION_EMOJIS },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deletedForEveryone: { type: Boolean, default: false, index: true },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDelivered: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    isSystem: { type: Boolean, default: false },
    isFlagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({
  receiver: 1,
  isRead: 1,
  deletedForEveryone: 1,
  createdAt: -1,
});
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ "attachment.publicId": 1 }, { sparse: true });

messageSchema.pre("save", function () {
  if (this.isModified("reactions") && this.reactions.length > 0) {
    const seenUsers = new Set();
    this.reactions = this.reactions.filter((reaction) => {
      const userIdStr = reaction.user.toString();
      if (seenUsers.has(userIdStr)) return false;
      seenUsers.add(userIdStr);
      return true;
    });
  }
  // ✅ FIXED: Enhanced privacy wipe - also clears edit history
  if (this.isModified("deletedForEveryone") && this.deletedForEveryone) {
    this.text = "[Message deleted]";
    this.attachment = null;
    this.reactions = [];
    this.post = null;
    this.type = "text";
    this.isEdited = false;
    this.editedAt = null;
  }
});

messageSchema.methods.hasReacted = function (userId, emoji = null) {
  if (!userId) return false;
  const userIdStr = userId.toString();
  return this.reactions.some(
    (r) => r.user.toString() === userIdStr && (!emoji || r.emoji === emoji)
  );
};

export default mongoose.model("Message", messageSchema);
