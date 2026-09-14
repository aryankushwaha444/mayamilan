import Post from "../models/Post.js";
import Comment from "../models/Comment.js";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import Share from "../models/Share.js";
import Match from "../models/Match.js";
import { getIO } from "../sockets/socket.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { invalidateCache, invalidateUserCache } from "../utils/cache.js";
import { sendPushToMany, getMatchIds } from "../utils/push.js";

// Helper: upload buffer to Cloudinary
const uploadBufferToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "maya_milan/posts",
        resource_type: "image",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// Create a new post
export const createPost = async (req, res, next) => {
  try {
    const { content } = req.body;
    const author = req.user._id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Post content is required",
      });
    }

    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await uploadBufferToCloudinary(file.buffer);
          images.push({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } catch (uploadError) {
          console.error("Cloudinary upload failed:", uploadError.message);
          return res.status(500).json({
            success: false,
            message: `Image upload failed: ${uploadError.message}`,
          });
        }
      }
    }

    const post = await Post.create({
      author,
      content: content.trim(),
      images,
    });

    const populated = await Post.findById(post._id).populate(
      "author",
      "name photos isVerified"
    );

    const matchIds = await getMatchIds(req.user._id);

    // Notify matches
    try {
      const io = getIO();
      if (io && matchIds.length > 0) {
        matchIds.forEach((matchId) => {
          io.to(`user:${matchId}`).emit("new_post", {
            postId: post._id.toString(),
            author: {
              _id: populated.author._id.toString(),
              name: populated.author.name,
              photos: populated.author.photos || [],
            },
            content: (content || "").slice(0, 80),
            hasImages: images.length > 0,
          });
        });
      }
    } catch (emitErr) {
      console.warn("Post socket emit failed:", emitErr.message);
    }

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: {
        ...populated.toObject(),
        isMine: true,
        isLiked: false,
        isSaved: false,
      },
    });
    await invalidateCache("feed:*");
  } catch (error) {
    console.error("Create post error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create post",
    });
  }
};

// Get feed - FIXED VERSION
export const getFeed = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;

    const [posts, total] = await Promise.all([
      Post.find()
        .populate("author", "name photos isVerified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Post.countDocuments(),
    ]);

    const postIds = posts.map((p) => p._id);
    const shares = await Share.find({
      post: { $in: postIds },
      sharedTo: req.user._id,
    })
      .populate("sharedBy", "name")
      .lean();

    const shareCounts = await Share.aggregate([
      { $match: { post: { $in: postIds } } },
      { $group: { _id: "$post", recipients: { $addToSet: "$sharedTo" } } },
      { $project: { count: { $size: "$recipients" } } },
    ]);

    const shareCountMap = {};
    shareCounts.forEach((s) => {
      shareCountMap[s._id.toString()] = s.count;
    });

    const shareMap = {};
    shares.forEach((s) => {
      shareMap[s.post.toString()] = s.sharedBy;
    });

    const userId = req.user._id.toString();

    // ✅ SAFE MAPPING - This is the critical fix
    const enriched = posts.map((post) => {
      // Check if author exists before accessing _id
      const authorExists = post.author && post.author._id;
      const authorId = authorExists ? post.author._id.toString() : "deleted";

      return {
        ...post,
        // Provide fallback author if deleted
        author: authorExists
          ? post.author
          : {
              _id: "deleted",
              name: "Deleted User",
              photos: [],
              isVerified: false,
            },
        isLiked:
          post.likes && Array.isArray(post.likes)
            ? post.likes.map((id) => id.toString()).includes(userId)
            : false,
        isSaved:
          post.saves && Array.isArray(post.saves)
            ? post.saves.map((id) => id.toString()).includes(userId)
            : false,
        isMine: authorId === userId,
        sharedBy: shareMap[post._id.toString()] || null,
        sharesCount: shareCountMap[post._id.toString()] || 0,
      };
    });

    res.status(200).json({
      success: true,
      posts: enriched,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
      },
    });
  } catch (error) {
    console.error("Get feed error:", error);
    next(error);
  }
};

// Get user's own posts
export const getMyPosts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id;

    const [posts, total] = await Promise.all([
      Post.find({ author: userId })
        .populate("author", "name photos isVerified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Post.countDocuments({ author: userId }),
    ]);

    const enriched = posts.map((post) => ({
      ...post,
      isLiked:
        post.likes && Array.isArray(post.likes)
          ? post.likes.map((id) => id.toString()).includes(userId.toString())
          : false,
      isSaved:
        post.saves && Array.isArray(post.saves)
          ? post.saves.map((id) => id.toString()).includes(userId.toString())
          : false,
      isMine: true,
    }));

    res.status(200).json({
      success: true,
      posts: enriched,
      pagination: { page: pageNumber, limit: limitNumber, total },
    });
  } catch (error) {
    next(error);
  }
};

// Get saved posts
export const getSavedPosts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id;

    const [posts, total] = await Promise.all([
      Post.find({ saves: userId })
        .populate("author", "name photos isVerified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Post.countDocuments({ saves: userId }),
    ]);

    const enriched = posts.map((post) => ({
      ...post,
      author:
        post.author && post.author._id
          ? post.author
          : {
              _id: "deleted",
              name: "Deleted User",
              photos: [],
              isVerified: false,
            },
      isLiked:
        post.likes && Array.isArray(post.likes)
          ? post.likes.map((id) => id.toString()).includes(userId.toString())
          : false,
      isSaved: true,
      isMine:
        post.author && post.author._id
          ? post.author._id.toString() === userId.toString()
          : false,
    }));

    res.status(200).json({
      success: true,
      posts: enriched,
      pagination: { page: pageNumber, limit: limitNumber, total },
    });
  } catch (error) {
    next(error);
  }
};

// Get single post
export const getPostById = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "name photos isVerified")
      .lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const userId = req.user._id.toString();
    res.status(200).json({
      success: true,
      post: {
        ...post,
        author:
          post.author && post.author._id
            ? post.author
            : {
                _id: "deleted",
                name: "Deleted User",
                photos: [],
                isVerified: false,
              },
        isLiked:
          post.likes && Array.isArray(post.likes)
            ? post.likes.map((id) => id.toString()).includes(userId)
            : false,
        isSaved:
          post.saves && Array.isArray(post.saves)
            ? post.saves.map((id) => id.toString()).includes(userId)
            : false,
        isMine:
          post.author && post.author._id
            ? post.author._id.toString() === userId
            : false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Edit post
export const editPost = async (req, res, next) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if (!content || content.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Content cannot be empty" });
    }

    post.content = content.trim();
    post.isEdited = true;
    await post.save();

    const populated = await Post.findById(post._id).populate(
      "author",
      "name photos isVerified"
    );

    res.status(200).json({
      success: true,
      message: "Post updated",
      post: populated,
    });

    await Promise.all([
      invalidateCache("feed:*"),
      invalidateCache(`post:*${post._id}*`),
    ]);
  } catch (error) {
    next(error);
  }
};

// Delete post
export const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    for (const img of post.images) {
      await cloudinary.uploader.destroy(img.publicId);
    }

    await Comment.deleteMany({ post: post._id });
    await Post.deleteOne({ _id: post._id });

    res.status(200).json({
      success: true,
      message: "Post deleted",
    });
    await invalidateCache("feed:*");
  } catch (error) {
    next(error);
  }
};

// Toggle like - WITH REAL-TIME SOCKET
export const toggleLike = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const userId = req.user._id;
    const alreadyLiked = post.likes.some(
      (id) => id.toString() === userId.toString()
    );

    if (alreadyLiked) {
      post.likes = post.likes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      post.likes.push(userId);
    }

    await post.save();

    // ✅ BROADCAST TO ALL USERS
    try {
      const io = getIO();
      if (io) {
        io.emit("post_likes_updated", {
          postId: post._id.toString(),
          likesCount: post.likes.length,
        });
      }
    } catch (emitErr) {
      console.warn("Like socket emit failed:", emitErr.message);
    }

    res.status(200).json({
      success: true,
      isLiked: !alreadyLiked,
      likesCount: post.likes.length,
    });
    await invalidateUserCache(req.user._id, ["feed"]);
  } catch (error) {
    next(error);
  }
};

// Toggle save
export const toggleSave = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const userId = req.user._id;
    const alreadySaved = post.saves.some(
      (id) => id.toString() === userId.toString()
    );

    if (alreadySaved) {
      post.saves = post.saves.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      post.saves.push(userId);
    }

    await post.save();

    res.status(200).json({
      success: true,
      isSaved: !alreadySaved,
      savesCount: post.saves.length,
    });
    await invalidateUserCache(req.user._id, ["feed", "saved-posts"]);
  } catch (error) {
    next(error);
  }
};

// Get comments
export const getComments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id.toString();

    const [comments, total] = await Promise.all([
      Comment.find({ post: req.params.id, parent: null })
        .populate("author", "name photos isVerified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Comment.countDocuments({ post: req.params.id, parent: null }),
    ]);

    const enriched = comments.map((c) => ({
      ...c,
      author:
        c.author && c.author._id
          ? c.author
          : {
              _id: "deleted",
              name: "Deleted User",
              photos: [],
              isVerified: false,
            },
      isMine:
        c.author && c.author._id ? c.author._id.toString() === userId : false,
      reactionSummary: summarizeReactions(c.reactions, userId),
    }));

    res.status(200).json({
      success: true,
      comments: enriched,
      pagination: { page: pageNumber, limit: limitNumber, total },
    });
  } catch (error) {
    next(error);
  }
};

// Add comment — broadcasts count AND the full comment to everyone
export const addComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    const postId = req.params.id;

    if (!content || content.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Comment cannot be empty" });
    }

    const post = await Post.findById(postId);
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    const comment = await Comment.create({
      post: postId,
      author: req.user._id,
      content: content.trim(),
    });

    post.commentsCount += 1;
    await post.save();

    const populated = await Comment.findById(comment._id).populate(
      "author",
      "name photos isVerified"
    );

    const commentPayload = {
      ...populated.toObject(),
      reactionSummary: [],
      repliesCount: 0,
    };

    // ✅ BROADCAST: count + the actual comment object to ALL connected users
    try {
      const io = getIO();
      if (io) {
        io.emit("post_comments_updated", {
          postId: postId.toString(),
          commentsCount: post.commentsCount,
        });
        io.emit("new_comment", {
          postId: postId.toString(),
          comment: commentPayload,
        });
      }
    } catch (emitErr) {
      console.warn("Comment socket emit failed:", emitErr.message);
    }

    res.status(201).json({
      success: true,
      comment: { ...commentPayload, isMine: true },
      commentsCount: post.commentsCount,
    });
    await invalidateCache(`comments:*${postId}*`);
  } catch (error) {
    next(error);
  }
};

// Delete comment — broadcasts which comment ids were removed
export const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });

    const post = await Post.findById(comment.post);
    const isCommentOwner =
      comment.author.toString() === req.user._id.toString();
    const isPostOwner =
      post && post.author.toString() === req.user._id.toString();

    if (!isCommentOwner && !isPostOwner) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const removedIds = [comment._id.toString()];

    if (!comment.parent) {
      // Top-level comment → also remove its replies (they were never in commentsCount)
      const replies = await Comment.find({ parent: comment._id }).select("_id");
      replies.forEach((r) => removedIds.push(r._id.toString()));
      await Comment.deleteMany({ parent: comment._id });
      await Comment.deleteOne({ _id: comment._id });
      await Post.findByIdAndUpdate(comment.post, {
        $inc: { commentsCount: -1 },
      });
    } else {
      // Reply → only decrement parent's repliesCount, commentsCount untouched
      await Comment.findByIdAndUpdate(comment.parent, {
        $inc: { repliesCount: -1 },
      });
      await Comment.deleteOne({ _id: comment._id });
    }

    const updatedPost = await Post.findById(comment.post);

    try {
      const io = getIO();
      if (io) {
        io.emit("comment_deleted", {
          postId: comment.post.toString(),
          removedIds,
          commentsCount: updatedPost ? updatedPost.commentsCount : 0,
        });
        io.emit("post_comments_updated", {
          postId: comment.post.toString(),
          commentsCount: updatedPost ? updatedPost.commentsCount : 0,
        });
      }
    } catch (emitErr) {
      console.warn("Delete comment socket emit failed:", emitErr.message);
    }

    res.status(200).json({ success: true, message: "Comment deleted" });
    await invalidateCache(`comments:*${comment.post}*`);
  } catch (error) {
    next(error);
  }
};

const summarizeReactions = (reactions, currentUserId) => {
  const map = {};
  (reactions || []).forEach((r) => {
    if (!map[r.emoji])
      map[r.emoji] = { emoji: r.emoji, count: 0, reactedByMe: false };
    map[r.emoji].count++;
    if (r.user.toString() === currentUserId) map[r.emoji].reactedByMe = true;
  });
  return Object.values(map);
};

// GET replies
// GET replies of a comment
export const getReplies = async (req, res, next) => {
  try {
    // ✅ Local helper — impossible to be "not defined"
    const summarize = (reactions, currentUserId) => {
      const map = {};
      (reactions || []).forEach((r) => {
        if (!map[r.emoji])
          map[r.emoji] = { emoji: r.emoji, count: 0, reactedByMe: false };
        map[r.emoji].count++;
        if (String(r.user) === String(currentUserId))
          map[r.emoji].reactedByMe = true;
      });
      return Object.values(map);
    };

    const commentId = req.params.commentId || req.params.id;
    console.log("🔁 getReplies requested for commentId:", commentId);

    const replies = await Comment.find({ parent: commentId })
      .populate("author", "name photos isVerified")
      .sort({ createdAt: 1 })
      .lean();

    console.log("🔁 replies found in DB:", replies.length);

    const userId = req.user._id.toString();
    const enriched = replies.map((r) => ({
      ...r,
      author: r.author
        ? r.author
        : {
            _id: "deleted",
            name: "Deleted User",
            photos: [],
            isVerified: false,
          },
      isMine: r.author ? String(r.author._id) === userId : false,
      reactionSummary: summarize(r.reactions, userId),
    }));

    res.status(200).json({ success: true, replies: enriched });
  } catch (error) {
    console.error("❌ getReplies error:", error.message);
    next(error);
  }
};
// CREATE a reply
// CREATE a reply
export const addReply = async (req, res, next) => {
  try {
    const { content } = req.body;
    const { id: postId, commentId } = req.params;

    if (!content || content.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Reply cannot be empty" });
    }

    const parent = await Comment.findById(commentId);
    if (!parent)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });

    const reply = await Comment.create({
      post: postId,
      parent: commentId,
      author: req.user._id,
      content: content.trim(),
    });

    parent.repliesCount += 1;
    await parent.save();

    const populated = await Comment.findById(reply._id).populate(
      "author",
      "name photos isVerified"
    );

    const replyPayload = {
      ...populated.toObject(),
      reactionSummary: [],
      repliesCount: 0,
    };

    // ✅ BROADCAST the new reply to ALL connected users
    try {
      const io = getIO();
      if (io) {
        io.emit("new_reply", {
          postId: postId.toString(),
          parentCommentId: commentId.toString(),
          reply: replyPayload,
        });
      }
    } catch (emitErr) {
      console.warn("Reply socket emit failed:", emitErr.message);
    }

    res.status(201).json({
      success: true,
      reply: { ...replyPayload, isMine: true },
      repliesCount: parent.repliesCount,
    });
  } catch (error) {
    next(error);
  }
};

// TOGGLE emoji reaction
export const toggleReaction = async (req, res, next) => {
  try {
    const { emoji } = req.body;
    const userId = req.user._id;

    if (!emoji) {
      return res
        .status(400)
        .json({ success: false, message: "Emoji required" });
    }

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) {
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    }

    const existing = comment.reactions.find(
      (r) => r.user.toString() === userId.toString()
    );

    if (existing && existing.emoji === emoji) {
      comment.reactions = comment.reactions.filter(
        (r) => r.user.toString() !== userId.toString()
      );
    } else if (existing) {
      existing.emoji = emoji;
    } else {
      comment.reactions.push({ user: userId, emoji });
    }

    await comment.save();

    res.status(200).json({
      success: true,
      reactionSummary: summarizeReactions(comment.reactions, userId.toString()),
    });
  } catch (error) {
    next(error);
  }
};

// GET share targets
export const getShareTargets = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    const matches = await Match.find({ users: currentUserId })
      .populate("users", "_id name photos isVerified isOnline lastSeen")
      .sort({ matchedAt: -1 })
      .lean();

    const targets = matches
      .map((m) =>
        m.users.find((u) => u._id.toString() !== currentUserId.toString())
      )
      .filter(Boolean);

    res.status(200).json({ success: true, users: targets });
  } catch (error) {
    next(error);
  }
};

// SHARE post
export const sharePost = async (req, res, next) => {
  try {
    const { userIds = [] } = req.body;
    const postId = req.params.id;
    const currentUserId = req.user._id;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one match to share with",
      });
    }

    const post = await Post.findById(postId).populate("author", "name photos");
    if (!post) {
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    }

    const matches = await Match.find({ users: currentUserId })
      .select("users")
      .lean();
    const matchedIds = new Set();
    matches.forEach((m) =>
      m.users.forEach((u) => {
        if (u.toString() !== currentUserId.toString())
          matchedIds.add(u.toString());
      })
    );

    const validTargets = userIds.filter((id) => matchedIds.has(id.toString()));
    if (validTargets.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You can only share posts with users you matched with",
      });
    }

    await Share.bulkWrite(
      validTargets.map((id) => ({
        updateOne: {
          filter: { post: postId, sharedBy: currentUserId, sharedTo: id },
          update: {
            $setOnInsert: {
              post: postId,
              sharedBy: currentUserId,
              sharedTo: id,
            },
          },
          upsert: true,
        },
      }))
    );

    const shareCountAgg = await Share.aggregate([
      { $match: { post: post._id } },
      { $group: { _id: "$post", recipients: { $addToSet: "$sharedTo" } } },
      { $project: { count: { $size: "$recipients" } } },
    ]);
    const sharesCount = shareCountAgg[0]?.count || 0;

    try {
      const io = getIO();
      if (io) {
        io.emit("post_shares_updated", {
          postId: post._id.toString(),
          sharesCount,
        });
      }
    } catch (e) {
      console.warn("Share socket emit failed:", e.message);
    }

    for (const targetId of validTargets) {
      try {
        let conversation = await Conversation.findOne({
          participants: { $all: [currentUserId, targetId] },
        });

        if (!conversation) {
          conversation = await Conversation.create({
            participants: [currentUserId, targetId],
          });
        }

        const msg = await Message.create({
          conversation: conversation._id,
          sender: currentUserId,
          receiver: targetId,
          type: "post",
          text: post.content,
          post: post._id,
        });

        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessage: msg._id,
          lastMessageAt: msg.createdAt,
        });

        try {
          const io = getIO();
          if (io) {
            const payload = {
              _id: msg._id.toString(),
              conversation: conversation._id.toString(),
              sender: {
                _id: currentUserId.toString(),
                name: req.user.name,
                photos: req.user.photos || [],
              },
              receiver: targetId.toString(),
              type: "post",
              text: post.content,
              post: {
                _id: post._id.toString(),
                content: post.content,
                images: post.images || [],
                author: {
                  _id: post.author?._id?.toString() || "",
                  name: post.author?.name || "Unknown",
                  photos: post.author?.photos || [],
                },
              },
              reactions: [],
              isRead: false,
              isDelivered: true,
              createdAt: msg.createdAt,
            };

            io.to(`user:${targetId}`).emit("new_message", payload);
            io.to(`user:${targetId}`).emit("conversation_updated", {
              conversationId: conversation._id.toString(),
              message: payload,
            });
          }
        } catch (e) {
          console.warn("Share message socket failed:", e.message);
        }
      } catch (e) {
        console.error("Share message failed for", targetId, e.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `Post shared with ${validTargets.length} ${
        validTargets.length === 1 ? "match" : "matches"
      }`,
      sharedCount: sharesCount,
    });
  } catch (error) {
    next(error);
  }
};
