import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import multer from "multer";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import { getIO } from "../sockets/socket.js";

/*
 * ==========================================
 * CREATE / GET CONVERSATION FROM MATCH
 * ==========================================
 */
export const createOrGetConversation = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { matchId } = req.params;

    // 1. Find match
    const match = await Match.findOne({ _id: matchId, users: currentUserId });
    if (!match) {
      return res
        .status(404)
        .json({ success: false, message: "Match not found" });
    }

    // 2. Find other user
    const otherUserId = match.users.find(
      (id) => id.toString() !== currentUserId.toString()
    );
    if (!otherUserId) {
      return res
        .status(400)
        .json({ success: false, message: "No other user in match" });
    }

    // 3. Check blocks
    const me = await User.findById(currentUserId).select(
      "blockedUsers isActive"
    );
    const otherUser = await User.findById(otherUserId).select(
      "blockedUsers isActive"
    );

    if (!me || !otherUser || !otherUser.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "User missing or inactive" });
    }

    const iBlocked = (me.blockedUsers || []).some(
      (id) => id.toString() === otherUserId.toString()
    );
    const blockedMe = (otherUser.blockedUsers || []).some(
      (id) => id.toString() === currentUserId.toString()
    );

    if (iBlocked || blockedMe) {
      return res.status(403).json({ success: false, message: "Blocked" });
    }

    // 4. Prepare sorted participants and unique key
    const participants = [currentUserId.toString(), otherUserId.toString()]
      .sort()
      .map((id) => new mongoose.Types.ObjectId(id));

    const participantsKey = [currentUserId.toString(), otherUserId.toString()]
      .sort()
      .join("_");

    // 5. Find existing conversation (by key first, fallback to array query)
    let conversation =
      (await Conversation.findOne({ participantsKey })) ||
      (await Conversation.findOne({
        participants: { $all: participants, $size: 2 },
      }));

    // Backfill the key if it's missing (old conversations)
    if (conversation && !conversation.participantsKey) {
      conversation.participantsKey = participantsKey;
      await conversation.save();
    }

    // 6. Create if not found, with race condition handling
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          participants,
          participantsKey,
        });
      } catch (err) {
        // Race condition: another request created it at the same moment
        if (err.code === 11000) {
          conversation = await Conversation.findOne({ participantsKey });
        } else {
          throw err;
        }
      }
    }

    // 7. Populate and return
    conversation = await Conversation.findById(conversation._id)
      .populate("participants", "_id name photos isOnline lastSeen")
      .populate(
        "lastMessage",
        "_id sender receiver text isRead createdAt type attachment"
      );

    return res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        participants: conversation.participants,
        lastMessage: conversation.lastMessage || null,
        lastMessageAt: conversation.lastMessageAt || conversation.createdAt,
        createdAt: conversation.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ createOrGetConversation error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
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
        "_id name photos dateOfBirth gender location occupation isOnline lastSeen blockedUsers"
      )
      .populate("lastMessage", "_id sender receiver text isRead createdAt type")
      .sort({
        lastMessageAt: -1,
        updatedAt: -1,
      });

    const me = await User.findById(currentUserId).select("blockedUsers");
    const myBlockedIds = new Set(
      (me?.blockedUsers || []).map((id) => id.toString())
    );

    const formattedConversations = conversations
      .map((conversation) => {
        const otherUser = conversation.participants.find(
          (user) => user._id.toString() !== currentUserId.toString()
        );

        if (!otherUser) return null;

        const iBlocked = myBlockedIds.has(otherUser._id.toString());
        const blockedMe = (otherUser.blockedUsers || []).some(
          (id) => id.toString() === currentUserId.toString()
        );

        if (iBlocked || blockedMe) return null;

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
      .populate("reactions.user", "_id name")
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
 * SEND MESSAGE (text, image, voice, gif, sticker, heart)
 * ==========================================
 */
export const sendMessage = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const { conversationId } = req.params;
    const { text = "", type = "text", attachment = null } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID",
      });
    }

    // Validate text for text messages
    if (type === "text" && (typeof text !== "string" || !text.trim())) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    const cleanText = (text || "").trim();

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

    const [me, receiver] = await Promise.all([
      User.findById(currentUserId).select("blockedUsers isActive"),
      User.findById(receiverId).select("blockedUsers isActive"),
    ]);

    if (!receiver || !receiver.isActive) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    const iBlocked = (me?.blockedUsers || []).some(
      (id) => id.toString() === receiverId.toString()
    );
    const blockedMe = (receiver.blockedUsers || []).some(
      (id) => id.toString() === currentUserId.toString()
    );

    if (iBlocked || blockedMe) {
      return res.status(403).json({
        success: false,
        message: "You cannot message this user",
      });
    }

    // 👇 Create message with type and attachment support
    const message = await Message.create({
      conversation: conversationId,
      sender: currentUserId,
      receiver: receiverId,
      text: cleanText,
      type,
      attachment,
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;

    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "_id name photos")
      .populate("receiver", "_id name photos")
      .populate("reactions.user", "_id name");

    const io = getIO();
    if (io) {
      io.to(`conversation:${conversationId}`).emit(
        "new_message",
        populatedMessage
      );

      io.to(`user:${receiverId.toString()}`).emit("conversation_updated", {
        conversationId,
        message: populatedMessage,
      });

      const receiverSockets = await io
        .in(`user:${receiverId.toString()}`)
        .fetchSockets();

      if (receiverSockets.length > 0) {
        message.isDelivered = true;
        message.deliveredAt = new Date();
        await message.save();

        io.to(`user:${currentUserId.toString()}`).emit("message_delivered", {
          messageId: message._id,
          conversationId,
        });
      }
    }

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
 * UPLOAD CHAT ATTACHMENT (image / voice / gif)
 * POST /api/messages/upload
 * ==========================================
 */
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
}).single("file");

export const uploadChatAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    console.log("📤 Uploading file:", {
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString(
      "base64"
    )}`;

    const result = await cloudinary.uploader.upload(b64, {
      resource_type: "auto",
      folder: "loveconnect/chat",
    });

    console.log("✅ Upload success:", result.secure_url);

    res.status(200).json({
      success: true,
      attachment: {
        url: result.secure_url,
        publicId: result.public_id,
        mimeType: req.file.mimetype,
        duration: result.duration || 0,
      },
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    next(error);
  }
};

/*
 * ==========================================
 * REACT TO MESSAGE
 * POST /api/messages/:messageId/react
 * ==========================================
 */
export const reactToMessage = async (req, res, next) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    const uid = req.user._id.toString();
    const existing = message.reactions.find((r) => r.user.toString() === uid);

    if (existing) {
      if (existing.emoji === emoji) {
        message.reactions = message.reactions.filter(
          (r) => r.user.toString() !== uid
        );
      } else {
        existing.emoji = emoji;
      }
    } else {
      message.reactions.push({ user: req.user._id, emoji });
    }

    await message.save();

    const populatedMessage = await Message.findById(message._id).populate(
      "reactions.user",
      "_id name"
    );

    const io = getIO();
    if (io) {
      io.to(`conversation:${message.conversation}`).emit("message_reacted", {
        messageId: message._id.toString(),
        reactions: populatedMessage.reactions,
      });
    }

    res
      .status(200)
      .json({ success: true, reactions: populatedMessage.reactions });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * DELETE MESSAGE (for me / for everyone)
 * DELETE /api/messages/:messageId?scope=me|everyone
 * ==========================================
 */
export const deleteMessage = async (req, res, next) => {
  try {
    const scope = req.query.scope || "me";
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

    const uid = req.user._id.toString();
    const isParticipant =
      message.sender.toString() === uid || message.receiver.toString() === uid;

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Not allowed" });
    }

    if (scope === "everyone") {
      if (message.sender.toString() !== uid) {
        return res.status(403).json({
          success: false,
          message: "Only the sender can delete for everyone",
        });
      }

      message.deletedForEveryone = true;

      if (message.attachment?.publicId) {
        cloudinary.uploader
          .destroy(message.attachment.publicId)
          .catch(() => {});
      }

      await message.save();

      const io = getIO();
      if (io) {
        io.to(`conversation:${message.conversation}`).emit("message_deleted", {
          messageId: message._id.toString(),
        });
      }
    } else {
      if (!message.deletedFor.some((id) => id.toString() === uid)) {
        message.deletedFor.push(req.user._id);
      }
      await message.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

/*
 * ==========================================
 * GET UNREAD MESSAGE COUNT
 * 👇 FIXED: only counts messages inside conversations
 *    that actually exist AND are not block-hidden
 * ==========================================
 */
export const getUnreadMessageCount = async (req, res, next) => {
  try {
    const myId = req.user._id.toString();

    // 1. My block list
    const me = await User.findById(myId).select("blockedUsers");
    const myBlockedIds = new Set(
      (me?.blockedUsers || []).map((id) => id.toString())
    );

    // 2. Conversations I participate in (that still exist)
    const conversations = await Conversation.find({
      participants: myId,
    }).populate("participants", "_id blockedUsers");

    // 3. Keep only visible ones (same rule as getConversations / getRecentConversations)
    const visibleConversationIds = conversations
      .filter((conv) => {
        const other = conv.participants.find((p) => p._id.toString() !== myId);
        if (!other) return false;

        const iBlocked = myBlockedIds.has(other._id.toString());
        const blockedMe = (other.blockedUsers || []).some(
          (id) => id.toString() === myId
        );

        return !iBlocked && !blockedMe;
      })
      .map((conv) => conv._id);

    // No visible conversations → count is 0 (no phantom badges!)
    if (visibleConversationIds.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    // 4. Count unread ONLY inside those conversations
    const unreadMessages = await Message.find({
      receiver: myId,
      isRead: false,
      deletedForEveryone: false,
      conversation: { $in: visibleConversationIds }, // 👈 orphans excluded
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

export const markMessageAsDelivered = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const message = await Message.findOne({
      _id: req.params.messageId,
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

      const io = getIO();
      if (io) {
        console.log("📬 Emitting message_delivered to sender");
        io.to(`user:${message.sender.toString()}`).emit("message_delivered", {
          messageId: message._id.toString(),
          conversationId: message.conversation.toString(),
        });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const markMessageAsRead = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const message = await Message.findOne({
      _id: req.params.messageId,
      receiver: currentUserId,
    });

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found" });
    }

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

      const io = getIO();
      if (io) {
        const payload = {
          messageId: message._id.toString(),
          conversationId: message.conversation.toString(),
        };

        console.log("👁️ Emitting message_read + unread_updated");

        // Sender: ✓ → ✓✓ → 🔵 live
        io.to(`user:${message.sender.toString()}`).emit(
          "message_delivered",
          payload
        );
        io.to(`user:${message.sender.toString()}`).emit(
          "message_read",
          payload
        );

        // 👇 ALWAYS sync reader's badge (race-proof)
        const io2 = getIO();
        if (io2) {
          io2.to(`user:${currentUserId.toString()}`).emit("unread_updated", {
            conversationId: message.conversation.toString(),
          });
        }

        res.status(200).json({ success: true });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const getRecentConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate(
        "participants",
        "_id name photos isOnline lastSeen blockedUsers"
      )
      .populate("lastMessage", "text createdAt sender receiver isRead type")
      .sort({ lastMessageAt: -1 })
      .limit(5);

    const me = await User.findById(req.user._id).select("blockedUsers");
    const myBlockedIds = new Set(
      (me?.blockedUsers || []).map((id) => id.toString())
    );

    const formatted = conversations
      .map((conv) => {
        const otherUser = conv.participants.find(
          (p) => p._id.toString() !== req.user._id.toString()
        );

        if (!otherUser) return null;

        const iBlocked = myBlockedIds.has(otherUser._id.toString());
        const blockedMe = (otherUser.blockedUsers || []).some(
          (id) => id.toString() === req.user._id.toString()
        );

        if (iBlocked || blockedMe) return null;

        return {
          _id: conv._id,
          user: otherUser,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
        };
      })
      .filter(Boolean);

    res.status(200).json({ success: true, conversations: formatted });
  } catch (error) {
    next(error);
  }
};
