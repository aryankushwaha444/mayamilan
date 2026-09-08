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

    // Safe unique key: "userIdA_userIdB" (sorted string)
    participantsKey: {
      type: String,
      unique: true,
      sparse: true,
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

// Normal index for faster lookups (no unique constraint on the array)
conversationSchema.index({ participants: 1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
