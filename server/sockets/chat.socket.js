import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Match from "../models/Match.js";
import { sanitize } from "../utils/sanitize.js"; // ✅ ADDED for XSS protection

const registerChatSocket = (io, socket) => {
  const currentUserId = socket.user._id.toString();

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  const checkBlocked = async (userId1, userId2) => {
    const [user1, user2] = await Promise.all([
      User.findById(userId1).select("blockedUsers").lean(),
      User.findById(userId2).select("blockedUsers").lean(),
    ]);
    const u1Blocked = (user1?.blockedUsers || []).some(
      (id) => id.toString() === userId2.toString()
    );
    const u2Blocked = (user2?.blockedUsers || []).some(
      (id) => id.toString() === userId1.toString()
    );
    return u1Blocked || u2Blocked;
  };

  const checkMatched = async (userId1, userId2) => {
    const match = await Match.findOne({
      users: { $all: [userId1, userId2] },
      isActive: { $ne: false },
    }).lean();
    return !!match;
  };

  // ═══════════════════════════════════════════
  // ROOM MANAGEMENT
  // ═══════════════════════════════════════════

  socket.on("join_conversation", async (conversationId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) return;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.user._id,
        isActive: { $ne: false },
      });

      if (!conversation) {
        socket.emit("chat_error", {
          message: "Conversation not found or inactive",
        });
        return;
      }

      socket.join(`conversation:${conversationId}`);
    } catch (error) {
      console.error("Join conversation error:", error);
    }
  });

  socket.on("leave_conversation", (conversationId) => {
    if (mongoose.Types.ObjectId.isValid(conversationId)) {
      socket.leave(`conversation:${conversationId}`);
    }
  });

  // ═══════════════════════════════════════════
  // TYPING INDICATORS
  // ═══════════════════════════════════════════

  socket.on("typing", async (conversationId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) return;

      // ✅ FIX: Verify participation to prevent spamming typing events to random rooms
      const isParticipant = await Conversation.exists({
        _id: conversationId,
        participants: socket.user._id,
      });
      if (!isParticipant) return;

      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        userId: currentUserId,
        conversationId,
      });
    } catch (error) {
      console.error("Typing error:", error);
    }
  });

  socket.on("stop_typing", async (conversationId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) return;

      const isParticipant = await Conversation.exists({
        _id: conversationId,
        participants: socket.user._id,
      });
      if (!isParticipant) return;

      socket.to(`conversation:${conversationId}`).emit("user_stopped_typing", {
        userId: currentUserId,
        conversationId,
      });
    } catch (error) {
      console.error("Stop typing error:", error);
    }
  });

  // ═══════════════════════════════════════════
  // SEND MESSAGE
  // ═══════════════════════════════════════════

  socket.on("send_message", async ({ conversationId, text }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return socket.emit("chat_error", {
          message: "Invalid conversation ID",
        });
      }

      if (typeof text !== "string" || !text.trim()) {
        return socket.emit("chat_error", {
          message: "Message cannot be empty",
        });
      }

      // ✅ FIX: Sanitize text to prevent XSS
      const cleanText = sanitize(text.trim());

      if (cleanText.length > 2000) {
        return socket.emit("chat_error", {
          message: "Message cannot exceed 2000 characters",
        });
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.user._id,
      });

      if (!conversation || conversation.isActive === false) {
        return socket.emit("chat_error", {
          message: "Conversation not found or inactive",
        });
      }

      const receiverId = conversation.participants.find(
        (participant) => participant.toString() !== currentUserId
      );

      if (!receiverId) {
        return socket.emit("chat_error", { message: "Receiver not found" });
      }

      const receiverIdStr = receiverId.toString();

      // ✅ FIX: Check if blocked
      if (await checkBlocked(currentUserId, receiverIdStr)) {
        return socket.emit("chat_error", {
          message: "You cannot message this user",
        });
      }

      // ✅ FIX: Check if still matched
      if (!(await checkMatched(currentUserId, receiverIdStr))) {
        return socket.emit("chat_error", {
          message: "You must be matched to send messages",
        });
      }

      const message = await Message.create({
        conversation: conversationId,
        sender: socket.user._id,
        receiver: receiverId,
        text: cleanText,
        type: "text",
        isDelivered: false,
        isRead: false,
      });

      // Update conversation metadata
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = message.createdAt;

      // ✅ FIX: Increment unread count for receiver
      const currentUnread = conversation.unreadCount?.get(receiverIdStr) || 0;
      conversation.unreadCount.set(receiverIdStr, currentUnread + 1);

      // ✅ FIX: Unhide conversation if receiver had hidden it
      if (
        conversation.hiddenBy?.some((id) => id.toString() === receiverIdStr)
      ) {
        conversation.hiddenBy = conversation.hiddenBy.filter(
          (id) => id.toString() !== receiverIdStr
        );
      }

      await conversation.save();

      // Also ensure it's removed from the User's hiddenConversations array
      await User.updateOne(
        { _id: receiverId },
        { $pull: { hiddenConversations: conversationId } }
      );

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "_id name photos")
        .populate("receiver", "_id name photos")
        .lean();

      io.to(`conversation:${conversationId}`).emit(
        "new_message",
        populatedMessage
      );

      io.to(`user:${receiverIdStr}`).emit("conversation_updated", {
        conversationId,
        message: populatedMessage,
      });

      // Auto-delivery check
      const receiverSockets = await io
        .in(`user:${receiverIdStr}`)
        .fetchSockets();

      if (receiverSockets.length > 0) {
        message.isDelivered = true;
        message.deliveredAt = new Date();
        await message.save();

        io.to(`user:${currentUserId}`).emit("message_delivered", {
          messageId: message._id,
          conversationId,
        });
      }
    } catch (error) {
      console.error("Send socket message error:", error);
      socket.emit("chat_error", { message: "Failed to send message" });
    }
  });

  // ═══════════════════════════════════════════
  // MESSAGE STATUS UPDATES
  // ═══════════════════════════════════════════

  socket.on("mark_delivered", async ({ messageId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(messageId)) return;

      // ✅ FIX: Ensure user is the actual receiver
      const message = await Message.findOne({
        _id: messageId,
        receiver: socket.user._id,
      });

      if (!message || message.isDelivered) return;

      message.isDelivered = true;
      message.deliveredAt = new Date();
      await message.save();

      io.to(`user:${message.sender.toString()}`).emit("message_delivered", {
        messageId: message._id.toString(),
        conversationId: message.conversation.toString(),
      });
    } catch (error) {
      console.error("Mark delivered error:", error);
    }
  });

  socket.on("mark_read", async ({ messageId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(messageId)) return;

      // ✅ FIX: Ensure user is the actual receiver
      const message = await Message.findOne({
        _id: messageId,
        receiver: socket.user._id,
      });

      if (!message) return;

      let changed = false;

      if (!message.isDelivered) {
        message.isDelivered = true;
        message.deliveredAt = new Date();
        changed = true;
      }

      if (!message.isRead) {
        message.isRead = true;
        message.readAt = new Date();
        changed = true;
      }

      if (changed) {
        await message.save();

        // ✅ FIX: Decrement unread count on the conversation
        const conversation = await Conversation.findById(message.conversation);
        if (conversation) {
          const currentCount =
            conversation.unreadCount?.get(currentUserId) || 0;
          if (currentCount > 0) {
            conversation.unreadCount.set(currentUserId, currentCount - 1);
            await conversation.save();
          }
        }

        io.to(`user:${message.sender.toString()}`).emit("message_read", {
          messageId: message._id.toString(),
          conversationId: message.conversation.toString(),
        });
      }

      // ALWAYS notify reader's navbar to update global unread count
      io.to(`user:${currentUserId}`).emit("unread_updated", {
        conversationId: message.conversation.toString(),
      });
    } catch (error) {
      console.error("Mark read error:", error);
    }
  });

  // ═══════════════════════════════════════════
  // PRESENCE
  // ═══════════════════════════════════════════

  socket.on("check_presence", async ({ userId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) return;

      const activeSockets = await io.in(`user:${userId}`).fetchSockets();

      socket.emit("presence_result", {
        userId,
        isOnline: activeSockets.length > 0,
      });
    } catch (error) {
      console.error("Check presence error:", error);
    }
  });
};

export default registerChatSocket;
