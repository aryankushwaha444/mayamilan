import mongoose from "mongoose";

const MEDIA_TYPES = ["audio", "video"];
const STATUSES = ["missed", "rejected", "ended", "failed"]; // 'ringing' is never persisted
const END_REASONS = [
  "hangup",
  "declined",
  "missed",
  "timeout",
  "disconnected",
  "busy",
  "blocked",
  "error",
];

const callSchema = new mongoose.Schema(
  {
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    callee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    mediaType: { type: String, enum: MEDIA_TYPES, required: true },
    status: { type: String, enum: STATUSES, required: true },
    startedAt: { type: Date, default: Date.now }, // when ringing began (server clock)
    connectedAt: { type: Date, default: null }, // set only if media actually connected
    endedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 }, // server-derived, never client-claimed
    endReason: { type: String, enum: END_REASONS, default: null },
  },
  { timestamps: true, versionKey: false }
);

callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ callee: 1, createdAt: -1 });
callSchema.index({ conversationId: 1, createdAt: -1 });

// Guard: a persisted call must have actually terminated; duration only meaningful if connected.
callSchema.pre("validate", function () {
  if (this.connectedAt && this.endedAt) {
    this.durationMs = Math.max(
      0,
      this.endedAt.getTime() - this.connectedAt.getTime()
    );
  } else {
    this.durationMs = 0;
  }
});

export default mongoose.model("Call", callSchema);
