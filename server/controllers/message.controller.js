import mongoose from "mongoose";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Match from "../models/Match.js";
import User from "../models/User.js";

/*
 * ==========================================
 * CREATE / GET CONVERSATION FROM MATCH
 * ==========================================
 */

export const createOrGetConversation = async (
  req,
  res,
  next
) => {
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    // Validate match ID
    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid match ID",
      });
    }

    // Find match belonging to current user
    const match = await Match.findOne({
      _id: matchId,
      users: currentUserId,
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Match must contain exactly two users
    if (!match.users || match.users.length !== 2) {
      return res.status(400).json({
        success: false,
        message: "Invalid match",
      });
    }

    // Find the other matched user
    const otherUserId = match.users.find(
      (userId) =>
        userId.toString() !==
        currentUserId.toString()
    );

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine matched user",
      });
    }

    // Check whether other user is still active
    const otherUser = await User.findOne({
      _id: otherUserId,
      isActive: true,
    }).select(
      "_id name photos dateOfBirth gender location occupation"
    );

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "Matched user not found",
      });
    }

    /*
     * Keep participant order consistent.
     */

    const participants = [
      currentUserId.toString(),
      otherUserId.toString(),
    ]
      .sort()
      .map(
        (id) => new mongoose.Types.ObjectId(id)
      );

    /*
     * Find existing conversation.
     */

    let conversation =
      await Conversation.findOne({
        participants,
      })
        .populate(
          "participants",
          "_id name photos dateOfBirth gender location occupation"
        )
        .populate(
          "lastMessage",
          "_id sender receiver text isRead createdAt"
        );

    /*
     * Create conversation if it doesn't exist.
     */

    if (!conversation) {
      conversation =
        await Conversation.create({
          participants,
        });

      conversation =
        await Conversation.findById(
          conversation._id
        )
          .populate(
            "participants",
            "_id name photos dateOfBirth gender location occupation"
          )
          .populate(
            "lastMessage",
            "_id sender receiver text isRead createdAt"
          );
    }

    return res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        participants: conversation.participants,
        lastMessage:
          conversation.lastMessage,
        lastMessageAt:
          conversation.lastMessageAt,
        createdAt:
          conversation.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * GET MY CONVERSATIONS
 * ==========================================
 */

export const getConversations = async (
  req,
  res,
  next
) => {
  try {
    const currentUserId = req.user._id;

    const conversations =
      await Conversation.find({
        participants: currentUserId,
      })
        .populate(
          "participants",
          "_id name photos dateOfBirth gender location occupation"
        )
        .populate(
          "lastMessage",
          "_id sender receiver text isRead createdAt"
        )
        .sort({
          lastMessageAt: -1,
          updatedAt: -1,
        });

    const formattedConversations =
      conversations
        .map((conversation) => {
          const otherUser =
            conversation.participants.find(
              (user) =>
                user._id.toString() !==
                currentUserId.toString()
            );

          if (!otherUser) {
            return null;
          }

          return {
            _id: conversation._id,
            lastMessage:
              conversation.lastMessage,
            lastMessageAt:
              conversation.lastMessageAt,
            user: otherUser,
            createdAt:
              conversation.createdAt,
          };
        })
        .filter(Boolean);

    return res.status(200).json({
      success: true,
      count: formattedConversations.length,
      conversations: formattedConversations,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * GET MESSAGES
 * ==========================================
 */

export const getMessages = async (
  req,
  res,
  next
) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        conversationId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    const conversation =
      await Conversation.findOne({
        _id: conversationId,
        participants: currentUserId,
      });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const messages = await Message.find({
      conversation: conversationId,
    })
      .populate(
        "sender",
        "_id name photos"
      )
      .populate(
        "receiver",
        "_id name photos"
      )
      .sort({
        createdAt: 1,
      });

    return res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * SEND MESSAGE
 * ==========================================
 */

export const sendMessage = async (
  req,
  res,
  next
) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId } = req.params;
    const { text } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(
        conversationId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    const cleanText = text.trim();

    if (cleanText.length > 2000) {
      return res.status(400).json({
        success: false,
        message:
          "Message cannot exceed 2000 characters",
      });
    }

    /*
     * Make sure current user belongs
     * to the conversation.
     */

    const conversation =
      await Conversation.findOne({
        _id: conversationId,
        participants: currentUserId,
      });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    /*
     * Find receiver.
     */

    const receiverId =
      conversation.participants.find(
        (participant) =>
          participant.toString() !==
          currentUserId.toString()
      );

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine message receiver",
      });
    }

    /*
     * Make sure receiver is active.
     */

    const receiver = await User.findOne({
      _id: receiverId,
      isActive: true,
    });

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    /*
     * Create message.
     */

    const message = await Message.create({
      conversation: conversationId,
      sender: currentUserId,
      receiver: receiverId,
      text: cleanText,
    });

    /*
     * Update conversation preview.
     */

    conversation.lastMessage = message._id;
    conversation.lastMessageAt =
      message.createdAt;

    await conversation.save();

    /*
     * Populate message before returning.
     */

    const populatedMessage =
      await Message.findById(message._id)
        .populate(
          "sender",
          "_id name photos"
        )
        .populate(
          "receiver",
          "_id name photos"
        );

    return res.status(201).json({
      success: true,
      message: populatedMessage,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * MARK MESSAGE AS READ
 * ==========================================
 */

export const markMessageAsRead = async (
  req,
  res,
  next
) => {
  try {
    const currentUserId = req.user._id;
    const { messageId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        messageId
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID",
      });
    }

    const message = await Message.findOne({
      _id: messageId,
      receiver: currentUserId,
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();

      await message.save();
    }

    return res.status(200).json({
      success: true,
      message: "Message marked as read",
    });
  } catch (error) {
    next(error);
  }
};