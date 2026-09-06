import mongoose from "mongoose";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const registerChatSocket = (io, socket) => {
  const currentUserId =
    socket.user._id.toString();

  /*
   * ==========================================
   * JOIN CONVERSATION
   * ==========================================
   */

  socket.on(
    "join_conversation",
    async (conversationId) => {
      try {
        if (
          !mongoose.Types.ObjectId.isValid(
            conversationId
          )
        ) {
          return;
        }

        const conversation =
          await Conversation.findOne({
            _id: conversationId,
            participants: socket.user._id,
          });

        if (!conversation) {
          socket.emit("chat_error", {
            message:
              "Conversation not found",
          });

          return;
        }

        socket.join(
          `conversation:${conversationId}`
        );

        console.log(
          `${socket.user.name} joined conversation ${conversationId}`
        );
      } catch (error) {
        console.error(
          "Join conversation error:",
          error
        );
      }
    }
  );

  /*
   * ==========================================
   * LEAVE CONVERSATION
   * ==========================================
   */

  socket.on(
    "leave_conversation",
    (conversationId) => {
      socket.leave(
        `conversation:${conversationId}`
      );
    }
  );

  /*
   * ==========================================
   * TYPING
   * ==========================================
   */

  socket.on(
    "typing",
    async (conversationId) => {
      try {
        const conversation =
          await Conversation.findOne({
            _id: conversationId,
            participants: socket.user._id,
          });

        if (!conversation) return;

        socket
          .to(`conversation:${conversationId}`)
          .emit("user_typing", {
            userId: currentUserId,
          });
      } catch (error) {
        console.error(
          "Typing error:",
          error
        );
      }
    }
  );

  /*
   * ==========================================
   * STOP TYPING
   * ==========================================
   */

  socket.on(
    "stop_typing",
    async (conversationId) => {
      try {
        const conversation =
          await Conversation.findOne({
            _id: conversationId,
            participants: socket.user._id,
          });

        if (!conversation) return;

        socket
          .to(`conversation:${conversationId}`)
          .emit("user_stopped_typing", {
            userId: currentUserId,
          });
      } catch (error) {
        console.error(
          "Stop typing error:",
          error
        );
      }
    }
  );

  /*
   * ==========================================
   * SEND REAL-TIME MESSAGE
   * ==========================================
   */

  socket.on(
    "send_message",
    async ({ conversationId, text }) => {
      try {
        if (
          !mongoose.Types.ObjectId.isValid(
            conversationId
          )
        ) {
          return socket.emit("chat_error", {
            message:
              "Invalid conversation ID",
          });
        }

        if (
          typeof text !== "string" ||
          !text.trim()
        ) {
          return socket.emit("chat_error", {
            message:
              "Message cannot be empty",
          });
        }

        const cleanText = text.trim();

        if (cleanText.length > 2000) {
          return socket.emit("chat_error", {
            message:
              "Message cannot exceed 2000 characters",
          });
        }

        /*
         * Verify conversation membership.
         */

        const conversation =
          await Conversation.findOne({
            _id: conversationId,
            participants: socket.user._id,
          });

        if (!conversation) {
          return socket.emit("chat_error", {
            message:
              "Conversation not found",
          });
        }

        /*
         * Find receiver.
         */

        const receiverId =
          conversation.participants.find(
            (participant) =>
              participant.toString() !==
              currentUserId
          );

        if (!receiverId) {
          return socket.emit("chat_error", {
            message:
              "Receiver not found",
          });
        }

        /*
         * Create message.
         */

        const message =
          await Message.create({
            conversation: conversationId,
            sender: socket.user._id,
            receiver: receiverId,
            text: cleanText,
          });

        /*
         * Update conversation.
         */

        conversation.lastMessage =
          message._id;

        conversation.lastMessageAt =
          message.createdAt;

        await conversation.save();

        /*
         * Populate sender and receiver.
         */

        const populatedMessage =
          await Message.findById(
            message._id
          )
            .populate(
              "sender",
              "_id name photos"
            )
            .populate(
              "receiver",
              "_id name photos"
            );

        /*
         * Send message to everyone
         * inside this conversation.
         */

        io.to(
          `conversation:${conversationId}`
        ).emit(
          "new_message",
          populatedMessage
        );

        /*
         * Also send directly to receiver's
         * personal room.
         *
         * This is useful when the receiver
         * hasn't opened the conversation.
         */

        io.to(
          `user:${receiverId.toString()}`
        ).emit(
          "conversation_updated",
          {
            conversationId,
            message:
              populatedMessage,
          }
        );
      } catch (error) {
        console.error(
          "Send socket message error:",
          error
        );

        socket.emit("chat_error", {
          message:
            "Failed to send message",
        });
      }
    }
  );
};

export default registerChatSocket;