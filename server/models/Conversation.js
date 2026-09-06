import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      validate: {
        validator: function (participants) {
          return participants.length === 2;
        },
        message: "A conversation must have exactly two participants.",
      },
    },

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Always keep participants in a
 * consistent order.
 */
conversationSchema.pre("validate", function (next) {
  if (this.participants?.length === 2) {
    this.participants.sort((a, b) => a.toString().localeCompare(b.toString()));
  }

  next();
});

/*
 * Prevent duplicate conversations
 * between the same two users.
 */
conversationSchema.index({ participants: 1 }, { unique: true });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
