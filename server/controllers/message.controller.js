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

export const createOrGetConversation = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    console.log(
      "🔵 Creating conversation for matchId:",
      matchId,
      "by user:",
      currentUserId
    );

    if (!mongoose.Types.ObjectId.isValid(matchId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid match ID" });
    }

    const match = await Match.findOne({
      _id: matchId,
      users: currentUserId,
    });

    if (!match) {
      console.log("❌ Match not found for user");
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    console.log("✅ Match found:", match._id);

    if (!match.users || match.users.length !== 2) {
      console.log("❌ Invalid match structure:", match.users);
      return res.status(400).json({ success: false, message: "Invalid match" });
    }

    const otherUserId = match.users.find(
      (userId) => userId.toString() !== currentUserId.toString()
    );

    if (!otherUserId) {
      console.log("❌ Unable to determine matched user");
      return res
        .status(400)
        .json({ success: false, message: "Unable to determine matched user" });
    }

    console.log("✅ Other user ID:", otherUserId);

    const otherUser = await User.findOne({
      _id: otherUserId,
      isActive: true,
    }).select("_id name photos dateOfBirth gender location occupation");

    if (!otherUser) {
      console.log("❌ Matched user not found or inactive");
      return res
        .status(404)
        .json({ success: false, message: "Matched user not found" });
    }

    console.log("✅ Other user verified:", otherUser.name);

    const participants = [currentUserId.toString(), otherUserId.toString()]
      .sort()
      .map((id) => new mongoose.Types.ObjectId(id));

    console.log("✅ Participants sorted:", participants);

    let conversation = await Conversation.findOne({ participants })
      .populate(
        "participants",
        "_id name photos dateOfBirth gender location occupation isOnline lastSeen"
      )
      .populate("lastMessage", "_id sender receiver text isRead createdAt");

    if (!conversation) {
      console.log("🆕 Creating new conversation...");
      conversation = await Conversation.create({ participants });

      conversation = await Conversation.findById(conversation._id)
        .populate(
          "participants",
          "_id name photos dateOfBirth gender location occupation isOnline lastSeen"
        )
        .populate("lastMessage", "_id sender receiver text isRead createdAt");
    }

    console.log("✅ Conversation ready:", conversation._id);

    return res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        participants: conversation.participants,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ CREATE CONVERSATION ERROR:", error);
    next(error);
  }
};

/*
 * ==========================================
 * GET MY CONVERSATIONS
 * ==========================================
 */

export const getConversations = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const conversations = await Conversation.find({
      participants: currentUserId,
    })
      .populate(
        "participants",
        "_id name photos dateOfBirth gender location occupation isOnline lastSeen"
      )
      .populate("lastMessage", "_id sender receiver text isRead createdAt")
      .sort({
        lastMessageAt: -1,
        updatedAt: -1,
      });

    const formattedConversations = conversations
      .map((conversation) => {
        const otherUser = conversation.participants.find(
          (user) => user._id.toString() !== currentUserId.toString()
        );

        if (!otherUser) {
          return null;
        }

        return {
          _id: conversation._id,
          lastMessage: conversation.lastMessage,
          lastMessageAt: conversation.lastMessageAt,
          user: otherUser,
          createdAt: conversation.createdAt,
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

export const getMessages = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    const conversation = await Conversation.findOne({
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
      .populate("sender", "_id name photos")
      .populate("receiver", "_id name photos")
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

export const sendMessage = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId } = req.params;
    const { text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    const cleanText = text.trim();

    if (cleanText.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message cannot exceed 2000 characters",
      });
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: currentUserId,
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const receiverId = conversation.participants.find(
      (participant) => participant.toString() !== currentUserId.toString()
    );

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Unable to determine message receiver",
      });
    }

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

    const message = await Message.create({
      conversation: conversationId,
      sender: currentUserId,
      receiver: receiverId,
      text: cleanText,
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;

    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "_id name photos")
      .populate("receiver", "_id name photos");

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
 * GET UNREAD MESSAGE COUNT
 * ==========================================
 */
export const getUnreadMessageCount = async (req, res, next) => {
  try {
    const unreadMessages = await Message.find({
      receiver: req.user._id,
      isRead: false,
    }).select("sender");

    const uniqueSenders = new Set(
      unreadMessages.map((msg) => msg.sender.toString())
    );

    res.status(200).json({
      success: true,
      count: uniqueSenders.size,
    });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * MARK MESSAGE AS DELIVERED
 * ==========================================
 */
export const markMessageAsDelivered = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      receiver: currentUserId,
    });

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    if (!message.isDelivered) {
      message.isDelivered = true;
      message.deliveredAt = new Date();
      await message.save();
    }

    res
      .status(200)
      .json({ success: true, message: "Message marked as delivered" });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * MARK MESSAGE AS READ
 * ==========================================
 */
export const markMessageAsRead = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      receiver: currentUserId,
    });

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      await message.save();
    }

    res.status(200).json({ success: true, message: "Message marked as read" });
  } catch (error) {
    next(error);
  }
};

export const getRecentConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate("participants", "_id name photos isOnline lastSeen")
      .populate("lastMessage", "text createdAt sender receiver isRead")
      .sort({ lastMessageAt: -1 })
      .limit(5);

    const formatted = conversations.map((conv) => {
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== req.user._id.toString()
      );
      return {
        _id: conv._id,
        user: otherUser,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
      };
    });

    res.status(200).json({ success: true, conversations: formatted });
  } catch (error) {
    next(error);
  }
};
