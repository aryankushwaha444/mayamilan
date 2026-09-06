import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const registerChatSocket = (io, socket) => {
  const currentUserId = socket.user._id.toString();

  /*
   * ==========================================
   * JOIN CONVERSATION
   * ==========================================
   */
  socket.on("join_conversation", async (conversationId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) return;

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.user._id,
      });

      if (!conversation) {
        socket.emit("chat_error", { message: "Conversation not found" });
        return;
      }

      socket.join(`conversation:${conversationId}`);
      console.log(`${socket.user.name} joined conversation ${conversationId}`);
    } catch (error) {
      console.error("Join conversation error:", error);
    }
  });

  /*
   * ==========================================
   * LEAVE CONVERSATION
   * ==========================================
   */
  socket.on("leave_conversation", (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });

  /*
   * ==========================================
   * TYPING
   * ==========================================
   */
  socket.on("typing", async (conversationId) => {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.user._id,
      });
      if (!conversation) return;

      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        userId: currentUserId,
      });
    } catch (error) {
      console.error("Typing error:", error);
    }
  });

  /*
   * ==========================================
   * STOP TYPING
   * ==========================================
   */
  socket.on("stop_typing", async (conversationId) => {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.user._id,
      });
      if (!conversation) return;

      socket.to(`conversation:${conversationId}`).emit("user_stopped_typing", {
        userId: currentUserId,
      });
    } catch (error) {
      console.error("Stop typing error:", error);
    }
  });

  /*
   * ==========================================
   * SEND REAL-TIME MESSAGE (WITH AUTO-DELIVERY)
   * ==========================================
   */
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

      const cleanText = text.trim();

      if (cleanText.length > 2000) {
        return socket.emit("chat_error", {
          message: "Message cannot exceed 2000 characters",
        });
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.user._id,
      });

      if (!conversation) {
        return socket.emit("chat_error", { message: "Conversation not found" });
      }

      const receiverId = conversation.participants.find(
        (participant) => participant.toString() !== currentUserId
      );

      if (!receiverId) {
        return socket.emit("chat_error", { message: "Receiver not found" });
      }

      const message = await Message.create({
        conversation: conversationId,
        sender: socket.user._id,
        receiver: receiverId,
        text: cleanText,
        isDelivered: false,
        isRead: false,
      });

      conversation.lastMessage = message._id;
      conversation.lastMessageAt = message.createdAt;
      await conversation.save();

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "_id name photos")
        .populate("receiver", "_id name photos");

      // Send to conversation room
      io.to(`conversation:${conversationId}`).emit(
        "new_message",
        populatedMessage
      );

      // Send to receiver's personal room
      io.to(`user:${receiverId.toString()}`).emit("conversation_updated", {
        conversationId,
        message: populatedMessage,
      });

      /*
       * 👇 AUTO-DELIVERY: If the receiver is currently ONLINE (connected),
       * mark as delivered instantly and notify the sender (double tick).
       */
      const receiverSockets = await io
        .in(`user:${receiverId.toString()}`)
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

  /*
   * ==========================================
   * MARK MESSAGE AS DELIVERED (frontend ack)
   * ==========================================
   */
  socket.on("mark_delivered", async ({ messageId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(messageId)) return;

      const message = await Message.findById(messageId);
      if (!message || message.isDelivered) return;

      message.isDelivered = true;
      message.deliveredAt = new Date();
      await message.save();

      io.to(`user:${message.sender.toString()}`).emit("message_delivered", {
        messageId: message._id,
        conversationId: message.conversation,
      });
    } catch (error) {
      console.error("Mark delivered error:", error);
    }
  });

  /*
   * ==========================================
   * MARK MESSAGE AS READ (also sets delivered)
   * ==========================================
   */
  socket.on("mark_read", async ({ messageId }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(messageId)) return;

      const message = await Message.findById(messageId);
      if (!message || message.isRead) return;

      message.isRead = true;
      message.isDelivered = true; // 👈 Read implies delivered
      message.readAt = new Date();
      await message.save();

      io.to(`user:${message.sender.toString()}`).emit("message_read", {
        messageId: message._id,
        conversationId: message.conversation,
      });
    } catch (error) {
      console.error("Mark read error:", error);
    }
  });
};

export default registerChatSocket;
