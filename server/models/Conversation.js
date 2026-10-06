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
      _id: false, // Don't generate _ids for the array elements
    },

    // Link to the Match that created this conversation
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      default: null,
    },

    // Safe unique key: "userIdA_userIdB" (sorted string)
    participantsKey: {
      type: String,
      unique: true,
      required: true, // Enforced by pre-save hook
    },

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // 👇 Unread counts per user (Map allows dynamic user ID keys)
    unreadCount: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // 👇 "Delete for me" functionality
    hiddenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // 👇 Global archive/soft-delete (e.g., when users unmatch)
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ═══════════════════════════════════════════
// INDEXES
// ═══════════════════════════════════════════

// 1. Fast inbox retrieval: "Get my active conversations, sorted by newest"
conversationSchema.index({ participants: 1, isActive: 1, lastMessageAt: -1 });

// 2. Find conversation by Match ID (used when unmatching)
conversationSchema.index({ match: 1 });

// 3. Cleanup jobs (finding old, inactive, and hidden conversations)
conversationSchema.index({ isActive: 1, updatedAt: 1 });

// ═══════════════════════════════════════════
// PRE-SAVE HOOKS
// ═══════════════════════════════════════════

conversationSchema.pre("save", function () {
  // Auto-generate participantsKey to prevent developer error
  if (this.isModified("participants") || !this.participantsKey) {
    if (this.participants.length === 2) {
      const sortedIds = [...this.participants].sort((a, b) =>
        a.toString().localeCompare(b.toString())
      );
      this.participantsKey = `${sortedIds[0].toString()}_${sortedIds[1].toString()}`;
    }
  }

  // Ensure hiddenBy doesn't have duplicate user IDs
  if (this.isModified("hiddenBy") && this.hiddenBy.length > 0) {
    const uniqueIds = [...new Set(this.hiddenBy.map((id) => id.toString()))];
    this.hiddenBy = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
  }

});

// ═══════════════════════════════════════════
// INSTANCE METHODS
// ═══════════════════════════════════════════

/**
 * Check if conversation is hidden for a specific user
 */
conversationSchema.methods.isHiddenFor = function (userId) {
  return this.hiddenBy.some((id) => id.toString() === userId.toString());
};

/**
 * Increment unread count for the receiver (called when a new message is sent)
 */
conversationSchema.methods.incrementUnread = function (receiverId) {
  const key = receiverId.toString();
  const current = this.unreadCount.get(key) || 0;
  this.unreadCount.set(key, current + 1);
};

/**
 * Clear unread count for a user (called when they open the chat)
 */
conversationSchema.methods.clearUnread = function (userId) {
  const key = userId.toString();
  if (this.unreadCount.get(key) > 0) {
    this.unreadCount.set(key, 0);
    return true; // Indicates it was modified
  }
  return false;
};

/**
 * Hide conversation for a specific user ("Delete for me")
 */
conversationSchema.methods.hideFor = function (userId) {
  const idStr = userId.toString();
  if (!this.hiddenBy.some((id) => id.toString() === idStr)) {
    this.hiddenBy.push(userId);
  }
};

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
