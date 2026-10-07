import mongoose from "mongoose";

// ✅ CLIENT-INPUT WHITELIST — exported, deliberately EXCLUDES "call".
// Any controller / socket send-message handler that validates req.body.type
// MUST check against THIS list, so a client can never forge a call row.
export const ALLOWED_MESSAGE_TYPES = [
  "text",
  "image",
  "gif",
  "sticker",
  "voice",
  "heart",
  "post",
  "system",
];

// ✅ STORAGE ENUM — superset used ONLY by the Mongoose schema. "call" rows are
// created exclusively server-side by the call bridge (call.socket.js), which is
// participant-validated + rate-limited; the client-facing path above stays closed.
export const STORED_MESSAGE_TYPES = [...ALLOWED_MESSAGE_TYPES, "call"];

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
    // ✅ schema uses the STORAGE superset (accepts server-created "call");
    //    client input is still gated by ALLOWED_MESSAGE_TYPES in the controller.
    type: { type: String, enum: STORED_MESSAGE_TYPES, default: "text" },
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
    // ✅ call-log fields (persisted so call rows survive refresh; read by the client's extractCall)
    callType: { type: String, enum: ["audio", "video"], default: null },
    callStatus: { type: String, default: null },
    durationMs: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    callId: { type: String, default: null, index: true },
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