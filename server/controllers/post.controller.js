import mongoose from "mongoose";
import Post from "../models/Post.js";
import PostLike from "../models/PostLike.js";
import PostSave from "../models/PostSave.js";
import Comment from "../models/Comment.js";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import Share from "../models/Share.js";
import Match from "../models/Match.js";
import { getIO } from "../sockets/socket.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { invalidateCache } from "../utils/cache.js";
import { getMatchIds } from "../utils/push.js";
import { sanitize } from "../utils/sanitize.js";
import { logAudit } from "../utils/auditLogger.js"; // 🔒 FIX #1: was missing -> audit silently dead

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGES_PER_POST = 5;
const POST_EDIT_TIME_LIMIT_MS = 60 * 60 * 1000; // 60 min
// 🔒 FIX #8: must not exceed Post.js schema maxlength (2000), else ValidationError 500
const MAX_CONTENT_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 1000;
const POSTS_PER_PAGE = 20;
const MAX_POSTS_LIMIT = 50;
const MAX_SHARE_TARGETS = 10;
const ALLOWED_EMOJIS = ["❤️", "👍", "👎", "😂", "😮", "😢", "", "🎉", "", "🤔"];
const HEX_ID = /^[a-f\d]{24}$/i;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

// Note: the upload middleware already enforces magic-bytes + sharp + NSFW for
// images, so by the time we're here every file IS a validated image. This is
// belt-and-suspenders only.
const validateImageFile = (file) => {
  if (!ALLOWED_IMAGE_MIME.includes(file.mimetype))
    throw new Error(`Invalid file type: ${file.mimetype}`);
  if (file.size > MAX_IMAGE_SIZE)
    throw new Error(
      `File too large. Maximum: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
    );
};

const uploadBufferToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "maya_milan/posts",
        resource_type: "image",
        transformation: [
          { width: 1600, height: 1600, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "auto" },
        ],
        allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });

// 🔒 FIX #4: two-way block check (mirrors message.controller.checkBlocked)
const isBlockedBetween = async (a, b) => {
  const [ua, ub] = await Promise.all([
    User.findById(a).select("blockedUsers").lean(),
    User.findById(b).select("blockedUsers").lean(),
  ]);
  const aStr = a.toString(),
    bStr = b.toString();
  return (
    (ua?.blockedUsers || []).some((id) => id.toString() === bStr) ||
    (ub?.blockedUsers || []).some((id) => id.toString() === aStr)
  );
};

// 🔒 FIX #3 + #4: batched "authors I must never see" = (I blocked) ∪ (blocked me),
// returned as REAL ObjectIds so $nin actually matches the ObjectId field.
const getExcludedAuthorIds = async (viewerId) => {
  const [me, blockers] = await Promise.all([
    User.findById(viewerId).select("blockedUsers").lean(),
    User.find({ blockedUsers: viewerId }).select("_id").lean(),
  ]);
  const set = new Set();
  (me?.blockedUsers || []).forEach((id) => set.add(id.toString()));
  blockers.forEach((b) => set.add(b._id.toString()));
  return Array.from(set).map((s) => new mongoose.Types.ObjectId(s));
};

// 🔒 FIX #7: Map-or-object safe unread access (same pattern as message.controller)
const getUnreadSafely = (conv, idStr) =>
  !conv.unreadCount
    ? 0
    : typeof conv.unreadCount.get === "function"
    ? conv.unreadCount.get(idStr) || 0
    : conv.unreadCount[idStr] || 0;
const setUnreadSafely = (conv, idStr, value) => {
  if (!conv.unreadCount) conv.unreadCount = new Map();
  if (typeof conv.unreadCount.set === "function")
    conv.unreadCount.set(idStr, value);
  else conv.unreadCount[idStr] = value;
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

const enrichPost = (
  post,
  userId,
  isLiked,
  isSaved,
  shareMap = {},
  shareCountMap = {}
) => {
  const authorExists = post.author && post.author._id;
  const authorId = authorExists ? post.author._id.toString() : "deleted";
  return {
    ...post,
    author: authorExists
      ? post.author
      : { _id: "deleted", name: "Deleted User", photos: [], isVerified: false },
    isLiked,
    isSaved,
    isMine: authorId === userId,
    sharedBy: shareMap[post._id.toString()] || null,
    sharesCount: shareCountMap[post._id.toString()] || 0,
  };
};

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    /* never break a request */
  }
};

const isHexId = (v) => typeof v === "string" && HEX_ID.test(v);

export const toggleLike = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .select("likesCount author")
      .lean();

    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    if (await isBlockedBetween(userId, post.author))
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    let isLiked = false;
    let delta = 0;

    const existing = await PostLike.findOne({
      post: postId,
      user: userId,
    }).lean();

    if (existing) {
      const del = await PostLike.deleteOne({ _id: existing._id });

      if (del.deletedCount === 1) {
        isLiked = false;
        delta = -1;
      } else {
        // Lost race: someone else already removed it, so it is still unliked.
        isLiked = false;
        delta = 0;
      }
    } else {
      try {
        await PostLike.create({ post: postId, user: userId });
        isLiked = true;
        delta = 1;
      } catch (e) {
        if (e.code === 11000) {
          // Concurrent like already exists.
          isLiked = true;
          delta = 0;
        } else {
          throw e;
        }
      }
    }

    let likesCount = post.likesCount;

    if (delta !== 0) {
      const upd = await Post.findByIdAndUpdate(
        postId,
        { $inc: { likesCount: delta } },
        { returnDocument: "after" }
      )
        .select("likesCount")
        .lean();

      likesCount = upd?.likesCount ?? likesCount + delta;
    }

    const io = getIO();

    if (io && delta !== 0) {
      const payload = {
        postId: postId.toString(),
        likesCount,
        isLiked,
        actorId: userId.toString(),
      };

      // Notify both the person who clicked and the post author.
      const rooms = new Set([
        `user:${userId.toString()}`,
        `user:${post.author.toString()}`,
      ]);

      rooms.forEach((room) => {
        io.to(room).emit("post_likes_updated", payload);
      });
    }

    await safeLogAudit(req, "post_like_toggled", {
      postId,
      isLiked,
    });

    return res.status(200).json({
      success: true,
      isLiked,
      likesCount,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// TOGGLE SAVE  (🛑 FIX #2)
// ═══════════════════════════════════════════
export const toggleSave = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const userId = req.user._id;

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .select("savesCount author")
      .lean();
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (await isBlockedBetween(userId, post.author))
      // 🔒 #4  uniform 404-on-block (no existence oracle)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    let isSaved = false,
      delta = 0;
    const existing = await PostSave.findOne({
      post: postId,
      user: userId,
    }).lean();
    if (existing) {
      const del = await PostSave.deleteOne({ _id: existing._id });
      if (del.deletedCount === 1) {
        isSaved = false;
        delta = -1;
      } else {
        isSaved = true;
        delta = 0;
      }
    } else {
      try {
        await PostSave.create({ post: postId, user: userId });
        isSaved = true;
        delta = 1;
      } catch (e) {
        if (e.code === 11000) {
          isSaved = true;
          delta = 0;
        } else throw e;
      }
    }

    let savesCount = post.savesCount;
    if (delta !== 0) {
      const upd = await Post.findByIdAndUpdate(
        postId,
        { $inc: { savesCount: delta } },
        { returnDocument: "after" }
      )
        .select("savesCount")
        .lean();
      savesCount = upd?.savesCount ?? savesCount + delta;
    }

    await safeLogAudit(req, "post_save_toggled", { postId, isSaved });
    return res.status(200).json({ success: true, isSaved, savesCount });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// ADD COMMENT  (🛑 FIX #2)
// ═══════════════════════════════════════════
export const addComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    const postId = req.params.id;
    const userId = req.user._id;

    const cleanContent = sanitize(content || "");
    if (!cleanContent)
      return res
        .status(400)
        .json({ success: false, message: "Comment cannot be empty" });
    if (cleanContent.length > MAX_COMMENT_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`,
      });

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .select("commentsCount author")
      .lean();
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (await isBlockedBetween(userId, post.author))
      // 🔒 #4  uniform 404-on-block (no existence oracle)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    const [comment] = await Comment.create([
      { post: postId, author: userId, content: cleanContent },
    ]);
    const upd = await Post.findByIdAndUpdate(
      postId,
      { $inc: { commentsCount: 1 } },
      { returnDocument: "after" }
    )
      .select("commentsCount")
      .lean();

    const populated = await Comment.findById(comment._id)
      .populate("author", "name photos isVerified")
      .lean();
    const commentPayload = {
      ...populated,
      reactionSummary: [],
      repliesCount: 0,
    };

    const io = getIO();
    if (io)
      io.to(`post:${postId}`).emit("new_comment", {
        postId: postId.toString(),
        comment: { ...commentPayload, isMine: true },
      });

    await safeLogAudit(req, "comment_added", {
      postId,
      commentId: comment._id,
    });
    res.status(201).json({
      success: true,
      comment: { ...commentPayload, isMine: true },
      commentsCount: upd?.commentsCount ?? post.commentsCount + 1,
    });
    await invalidateCache(`comments:*${postId}*`);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE POST
// ═══════════════════════════════════════════
export const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (post.author.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Unauthorized" });

    if (post.images?.length) {
      await Promise.all(
        post.images.map((img) =>
          img.publicId
            ? cloudinary.uploader.destroy(img.publicId).catch(() => {})
            : Promise.resolve()
        )
      );
    }
    post.isDeleted = true;
    post.deletedAt = new Date();
    await post.save();

    await safeLogAudit(req, "post_deleted", {
      postId: post._id,
      imagesDeleted: post.images?.length || 0,
    });
    res.status(200).json({ success: true, message: "Post deleted" });
    await invalidateCache("feed:*");
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// CREATE POST
// ═══════════════════════════════════════════
export const createPost = async (req, res, next) => {
  const uploadedPublicIds = [];
  try {
    const { content } = req.body;
    const author = req.user._id;
    const cleanContent = sanitize(content || "");

    if (!cleanContent && (!req.files || req.files.length === 0))
      return res
        .status(400)
        .json({ success: false, message: "Post must have text or images" });
    if (cleanContent.length > MAX_CONTENT_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Content cannot exceed ${MAX_CONTENT_LENGTH} characters`,
      });

    const images = [];
    if (req.files?.length) {
      if (req.files.length > MAX_IMAGES_PER_POST)
        return res.status(400).json({
          success: false,
          message: `Maximum ${MAX_IMAGES_PER_POST} images per post`,
        });
      for (const file of req.files) {
        try {
          validateImageFile(file);
          const result = await uploadBufferToCloudinary(file.buffer);
          uploadedPublicIds.push(result.public_id);
          images.push({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        } catch (uploadError) {
          console.error("Post image upload failed:", uploadError.message); // 🔒 #9: log internally...
          throw new Error("Image upload failed"); // ...don't leak to client
        }
      }
    }

    const post = await Post.create({ author, content: cleanContent, images });
    const populated = await Post.findById(post._id)
      .populate("author", "name photos isVerified")
      .lean();

    try {
      const matchIds = await getMatchIds(req.user._id);
      const io = getIO();
      if (io && matchIds.length > 0 && matchIds.length <= 100) {
        matchIds.forEach((matchId) => {
          io.to(`user:${matchId}`).emit("new_post", {
            postId: post._id.toString(),
            author: {
              _id: populated.author._id.toString(),
              name: populated.author.name,
              photos: populated.author.photos || [],
            },
            content: (cleanContent || "").slice(0, 80),
            hasImages: images.length > 0,
          });
        });
      }
    } catch {}

    await safeLogAudit(req, "post_created", {
      postId: post._id,
      hasImages: images.length > 0,
    });

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: { ...populated, isMine: true, isLiked: false, isSaved: false },
    });
    await invalidateCache("feed:*");
  } catch (error) {
    if (uploadedPublicIds.length)
      Promise.all(
        uploadedPublicIds.map((id) =>
          cloudinary.uploader.destroy(id).catch(() => {})
        )
      );
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET FEED  (🔒 FIX #3 + #4: real ObjectId $nin + two-way block)
// ═══════════════════════════════════════════
export const getFeed = async (req, res, next) => {
  try {
    const { page = 1, limit = POSTS_PER_PAGE } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || POSTS_PER_PAGE, 1),
      MAX_POSTS_LIMIT
    );
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id.toString();

    const excluded = await getExcludedAuthorIds(req.user._id); // ObjectIds

    const query = { isDeleted: false, isFlagged: false };
    if (excluded.length) query.author = { $nin: excluded };

    const [posts, total] = await Promise.all([
      Post.find(query)
        .populate("author", "name photos isVerified isActive deletedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Post.countDocuments(query),
    ]);

    // hide content from deactivated / soft-deleted authors (moderation leak)
    const visible = posts.filter((p) => {
      const a = p.author;
      return a && a._id && a.isActive !== false && !a.deletedAt;
    });

    const postIds = visible.map((p) => p._id);
    const [userLikes, userSaves, shares, shareCounts] = await Promise.all([
      PostLike.find({ post: { $in: postIds }, user: userId })
        .select("post")
        .lean(),
      PostSave.find({ post: { $in: postIds }, user: userId })
        .select("post")
        .lean(),
      Share.find({ post: { $in: postIds }, sharedTo: userId })
        .populate("sharedBy", "name")
        .lean(),
      Share.aggregate([
        { $match: { post: { $in: postIds } } },
        { $group: { _id: "$post", recipients: { $addToSet: "$sharedTo" } } },
        { $project: { count: { $size: "$recipients" } } },
      ]),
    ]);

    const likedSet = new Set(userLikes.map((l) => l.post.toString()));
    const savedSet = new Set(userSaves.map((s) => s.post.toString()));
    const shareCountMap = {};
    shareCounts.forEach((s) => (shareCountMap[s._id.toString()] = s.count));
    const shareMap = {};
    shares.forEach((s) => (shareMap[s.post.toString()] = s.sharedBy));

    const enriched = visible.map((post) =>
      enrichPost(
        post,
        userId,
        likedSet.has(post._id.toString()),
        savedSet.has(post._id.toString()),
        shareMap,
        shareCountMap
      )
    );

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
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET MY POSTS
// ═══════════════════════════════════════════
export const getMyPosts = async (req, res, next) => {
  try {
    const { page = 1, limit = POSTS_PER_PAGE } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || POSTS_PER_PAGE, 1),
      MAX_POSTS_LIMIT
    );
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id.toString();

    const [posts, total] = await Promise.all([
      Post.find({ author: userId, isDeleted: false })
        .populate("author", "name photos isVerified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Post.countDocuments({ author: userId, isDeleted: false }),
    ]);

    const postIds = posts.map((p) => p._id);
    const [userLikes, userSaves] = await Promise.all([
      PostLike.find({ post: { $in: postIds }, user: userId })
        .select("post")
        .lean(),
      PostSave.find({ post: { $in: postIds }, user: userId })
        .select("post")
        .lean(),
    ]);
    const likedSet = new Set(userLikes.map((l) => l.post.toString()));
    const savedSet = new Set(userSaves.map((s) => s.post.toString()));

    res.status(200).json({
      success: true,
      posts: posts.map((post) => ({
        ...post,
        isLiked: likedSet.has(post._id.toString()),
        isSaved: savedSet.has(post._id.toString()),
        isMine: true,
      })),
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET SAVED POSTS
// ═══════════════════════════════════════════
export const getSavedPosts = async (req, res, next) => {
  try {
    const { page = 1, limit = POSTS_PER_PAGE } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || POSTS_PER_PAGE, 1),
      MAX_POSTS_LIMIT
    );
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id.toString();

    const [saves, total] = await Promise.all([
      PostSave.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      PostSave.countDocuments({ user: userId }),
    ]);
    const postIds = saves.map((s) => s.post);
    const posts = await Post.find({ _id: { $in: postIds }, isDeleted: false })
      .populate("author", "name photos isVerified")
      .lean();
    const postMap = new Map(posts.map((p) => [p._id.toString(), p]));
    const userLikes = await PostLike.find({
      post: { $in: postIds },
      user: userId,
    })
      .select("post")
      .lean();
    const likedSet = new Set(userLikes.map((l) => l.post.toString()));

    const enriched = postIds
      .map((id) => {
        const post = postMap.get(id.toString());
        if (!post) return null;
        return {
          ...post,
          isLiked: likedSet.has(post._id.toString()),
          isSaved: true,
          isMine: post.author?._id?.toString() === userId,
        };
      })
      .filter(Boolean);

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
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET SINGLE POST  (🔒 FIX #4 + #8: block guard, no existence leak)
// ═══════════════════════════════════════════
export const getPostById = async (req, res, next) => {
  try {
    const post = await Post.findOne({ _id: req.params.id, isDeleted: false })
      .select("author")
      .lean();
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (await isBlockedBetween(req.user._id, post.author))
      return res
        .status(404)
        .json({ success: false, message: "Post not found" }); // hide existence

    const full = await Post.findOne({ _id: req.params.id, isDeleted: false })
      .populate("author", "name photos isVerified")
      .lean();
    const userId = req.user._id.toString();
    const [isLiked, isSaved] = await Promise.all([
      PostLike.exists({ post: full._id, user: userId }),
      PostSave.exists({ post: full._id, user: userId }),
    ]);
    res.status(200).json({
      success: true,
      post: enrichPost(full, userId, !!isLiked, !!isSaved),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// EDIT POST
// ═══════════════════════════════════════════
export const editPost = async (req, res, next) => {
  try {
    const { content } = req.body;
    const post = await Post.findOne({ _id: req.params.id, isDeleted: false });

    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (post.author.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Unauthorized" });

    // 🔒 Removed the 60-minute gate: a user may always edit their OWN post.
    // Ownership is enforced above; moderation evasion is mitigated by the
    // audit log + isFlagged feed filter + immutable edit history (editedAt).

    const cleanContent = sanitize(content || "");
    if (!cleanContent)
      return res
        .status(400)
        .json({ success: false, message: "Content cannot be empty" });
    if (cleanContent.length > MAX_CONTENT_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Content cannot exceed ${MAX_CONTENT_LENGTH} characters`,
      });

    post.content = cleanContent;
    post.isEdited = true;
    post.editedAt = new Date();
    await post.save();

    const populated = await Post.findById(post._id)
      .populate("author", "name photos isVerified")
      .lean();

    // 🔒 Audit the edit so there's a trail (replaces the old time-gate's purpose)
    await safeLogAudit(req, "post_edited", {
      postId: post._id,
      contentLength: cleanContent.length,
    });

    res
      .status(200)
      .json({ success: true, message: "Post updated", post: populated });
    await Promise.all([
      invalidateCache("feed:*"),
      invalidateCache(`post:*${post._id}*`),
    ]);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET COMMENTS  (🔒 FIX #4 + #8: block guard + hide blocked authors)
// ═══════════════════════════════════════════
export const getComments = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNumber - 1) * limitNumber;
    const userId = req.user._id.toString();

    const post = await Post.findOne({ _id: req.params.id, isDeleted: false })
      .select("author")
      .lean();
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (await isBlockedBetween(req.user._id, post.author))
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    const excluded = await getExcludedAuthorIds(req.user._id);
    const filter = { post: req.params.id, parent: null };
    if (excluded.length) filter.author = { $nin: excluded };

    const [comments, total] = await Promise.all([
      Comment.find(filter)
        .populate("author", "name photos isVerified")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Comment.countDocuments(filter),
    ]);

    const enriched = comments.map((c) =>
      c.isDeleted
        ? {
            ...c,
            content: "[deleted]",
            author: { _id: "deleted", name: "Deleted User", photos: [] },
            reactions: [],
            reactionSummary: [],
            isMine: false,
          }
        : {
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
              c.author && c.author._id
                ? c.author._id.toString() === userId
                : false,
            reactionSummary: summarizeReactions(c.reactions, userId),
          }
    );

    res.status(200).json({
      success: true,
      comments: enriched,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE COMMENT  (🔒 FIX #6: no double-decrement, route/post integrity)
// ═══════════════════════════════════════════
export const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.commentId)
      .select("post author parent isDeleted")
      .lean();
    if (!comment)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    if (comment.isDeleted)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" }); // 🔒 no double-decrement
    if (comment.post.toString() !== req.params.id)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" }); // 🔒 route integrity

    const post = await Post.findById(comment.post).select("author").lean();
    const isCommentOwner =
      comment.author.toString() === req.user._id.toString();
    const isPostOwner =
      post && post.author.toString() === req.user._id.toString();
    if (!isCommentOwner && !isPostOwner)
      return res.status(403).json({ success: false, message: "Unauthorized" });

    await Comment.findByIdAndUpdate(comment._id, {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        content: "[deleted]",
        reactions: [],
      },
    });
    if (!comment.parent)
      await Post.findByIdAndUpdate(comment.post, {
        $inc: { commentsCount: -1 },
      });
    else
      await Comment.findByIdAndUpdate(comment.parent, {
        $inc: { repliesCount: -1 },
      });

    const updatedPost = await Post.findById(comment.post)
      .select("commentsCount")
      .lean();
    const io = getIO();
    if (io)
      io.to(`post:${comment.post.toString()}`).emit("comment_deleted", {
        postId: comment.post.toString(),
        commentId: comment._id.toString(),
        commentsCount: updatedPost?.commentsCount ?? 0,
      });

    await safeLogAudit(req, "comment_deleted", {
      commentId: comment._id,
      byPostOwner: isPostOwner && !isCommentOwner,
    });
    res.status(200).json({ success: true, message: "Comment deleted" });
    await invalidateCache(`comments:*${comment.post}*`);
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET REPLIES  (🔒 FIX #4 + #8)
// ═══════════════════════════════════════════
export const getReplies = async (req, res, next) => {
  try {
    const commentId = req.params.commentId || req.params.id;
    const userId = req.user._id.toString();

    const parent = await Comment.findById(commentId).select("post").lean();
    if (!parent)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    const post = await Post.findById(parent.post)
      .select("author isDeleted")
      .lean();
    if (!post || post.isDeleted)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (await isBlockedBetween(req.user._id, post.author))
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    const excluded = await getExcludedAuthorIds(req.user._id);
    const filter = { parent: commentId };
    if (excluded.length) filter.author = { $nin: excluded };

    const replies = await Comment.find(filter)
      .populate("author", "name photos isVerified")
      .sort({ createdAt: 1 })
      .lean();
    const enriched = replies.map((r) =>
      r.isDeleted
        ? {
            ...r,
            content: "[deleted]",
            author: { _id: "deleted", name: "Deleted User", photos: [] },
            reactions: [],
            reactionSummary: [],
            isMine: false,
          }
        : {
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
            reactionSummary: summarizeReactions(r.reactions, userId),
          }
    );
    res.status(200).json({ success: true, replies: enriched });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// ADD REPLY  (🔒 FIX #5: use parent.post, guard deleted/nested, block check)
// ═══════════════════════════════════════════
export const addReply = async (req, res, next) => {
  try {
    const { content } = req.body;
    const { id: postId, commentId } = req.params;
    const userId = req.user._id;

    const cleanContent = sanitize(content || "");
    if (!cleanContent)
      return res
        .status(400)
        .json({ success: false, message: "Reply cannot be empty" });
    if (cleanContent.length > MAX_COMMENT_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Reply cannot exceed ${MAX_COMMENT_LENGTH} characters`,
      });

    const parent = await Comment.findById(commentId)
      .select("post author parent isDeleted")
      .lean();
    if (!parent)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    if (parent.isDeleted)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" }); // 🔒 no reply to deleted
    if (parent.parent)
      return res
        .status(400)
        .json({ success: false, message: "Replies cannot be nested" }); // 🔒 depth = 1 only
    if (parent.post.toString() !== postId)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" }); // 🔒 thread integrity

    const post = await Post.findById(parent.post)
      .select("author isDeleted")
      .lean();
    if (!post || post.isDeleted)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    if (
      (await isBlockedBetween(userId, post.author)) ||
      (await isBlockedBetween(userId, parent.author))
    )
      // 🔒 #4
      return res
        .status(403)
        .json({ success: false, message: "Cannot reply here" });

    const reply = await Comment.create({
      post: parent.post,
      parent: commentId,
      author: userId,
      content: cleanContent,
    }); // 🔒 #5 parent.post
    await Comment.findByIdAndUpdate(commentId, { $inc: { repliesCount: 1 } });

    const populated = await Comment.findById(reply._id)
      .populate("author", "name photos isVerified")
      .lean();
    const replyPayload = { ...populated, reactionSummary: [], repliesCount: 0 };
    const io = getIO();
    if (io)
      io.to(`post:${postId}`).emit("new_reply", {
        postId: postId.toString(),
        parentCommentId: commentId.toString(),
        reply: { ...replyPayload, isMine: true },
      });

    await safeLogAudit(req, "reply_added", {
      postId,
      parentCommentId: commentId,
      replyId: reply._id,
    });
    res.status(201).json({
      success: true,
      reply: { ...replyPayload, isMine: true },
      repliesCount: (parent.repliesCount || 0) + 1,
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// TOGGLE REACTION  (🔒 FIX #4)
// ═══════════════════════════════════════════
export const toggleReaction = async (req, res, next) => {
  try {
    const { emoji } = req.body;
    const userId = req.user._id;
    if (!emoji || !ALLOWED_EMOJIS.includes(emoji))
      return res.status(400).json({ success: false, message: "Invalid emoji" });

    const comment = await Comment.findById(req.params.commentId)
      .select("author isDeleted reactions")
      .lean();
    if (!comment || comment.isDeleted)
      return res
        .status(404)
        .json({ success: false, message: "Comment not found" });
    if (await isBlockedBetween(userId, comment.author))
      return res.status(403).json({ success: false, message: "Cannot react" }); // 🔒 #4

    const full = await Comment.findById(req.params.commentId); // hydrate to mutate + save
    const existing = full.reactions.find(
      (r) => r.user.toString() === userId.toString()
    );
    if (existing && existing.emoji === emoji)
      full.reactions = full.reactions.filter(
        (r) => r.user.toString() !== userId.toString()
      );
    else if (existing) existing.emoji = emoji;
    else full.reactions.push({ user: userId, emoji });
    await full.save();

    await safeLogAudit(req, "comment_reacted", { commentId: full._id, emoji });
    res.status(200).json({
      success: true,
      reactionSummary: summarizeReactions(full.reactions, userId.toString()),
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET SHARE TARGETS  (🔒 FIX #4: two-way block)
// ═══════════════════════════════════════════
export const getShareTargets = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;
    const excluded = await getExcludedAuthorIds(currentUserId);
    const excludedSet = new Set(excluded.map((id) => id.toString()));

    const matches = await Match.find({
      users: currentUserId,
      isActive: { $ne: false },
    })
      .populate(
        "users",
        "_id name photos isVerified isOnline lastSeen isActive"
      )
      .sort({ matchedAt: -1 })
      .lean();

    const targets = matches
      .map((m) =>
        m.users.find(
          (u) =>
            u._id.toString() !== currentUserId.toString() &&
            u.isActive !== false &&
            !excludedSet.has(u._id.toString()) // 🔒 hide blocked / blocked-me
        )
      )
      .filter(Boolean);

    res.status(200).json({ success: true, users: targets });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// SHARE POST  (🔒 FIX #4 + #7: block honored, safe unread, id hardening)
// ═══════════════════════════════════════════
export const sharePost = async (req, res, next) => {
  try {
    const { userIds = [] } = req.body;
    const postId = req.params.id;
    const currentUserId = req.user._id;

    if (!Array.isArray(userIds) || userIds.length === 0)
      return res.status(400).json({
        success: false,
        message: "Select at least one match to share with",
      });
    if (userIds.length > MAX_SHARE_TARGETS)
      return res.status(400).json({
        success: false,
        message: `Cannot share with more than ${MAX_SHARE_TARGETS} users at once`,
      });
    // 🔒 harden: every id must be a plain 24-hex string (neutralizes {$ne} style objects)
    const cleanIds = userIds.filter(isHexId);
    if (cleanIds.length !== userIds.length)
      return res
        .status(400)
        .json({ success: false, message: "Invalid recipient id" });

    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .populate("author", "name photos")
      .lean();
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });

    const matches = await Match.find({
      users: currentUserId,
      isActive: { $ne: false },
    })
      .select("users")
      .lean();
    const matchedIds = new Set();
    matches.forEach((m) =>
      m.users.forEach((u) => {
        if (u.toString() !== currentUserId.toString())
          matchedIds.add(u.toString());
      })
    );

    const excluded = await getExcludedAuthorIds(currentUserId); // 🔒 #4 two-way block
    const excludedSet = new Set(excluded.map((id) => id.toString()));

    const validTargets = cleanIds.filter(
      (id) => matchedIds.has(id) && !excludedSet.has(id)
    );
    if (validTargets.length === 0)
      return res.status(403).json({
        success: false,
        message:
          "You can only share posts with active matches you haven't blocked",
      });

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

    // 🔒 Keep denormalized post count reasonably fresh
    await Post.findByIdAndUpdate(
      post._id,
      { $set: { sharesCount } },
      { new: false }
    ).catch(() => {});

    // 🔒 FIX: notify open feeds immediately
    const shareIO = getIO();
    if (shareIO) {
      const sharePayload = {
        postId: postId.toString(),
        sharesCount,
        actorId: currentUserId.toString(),
      };

      const shareRooms = new Set([`user:${currentUserId.toString()}`]);

      if (post.author?._id) {
        shareRooms.add(`user:${post.author._id.toString()}`);
      }

      shareRooms.forEach((room) => {
        shareIO.to(room).emit("post_shares_updated", sharePayload);
      });
    }

    for (const targetId of validTargets) {
      try {
        const sortedIds = [currentUserId.toString(), targetId].sort();
        const participantsKey = `${sortedIds[0]}_${sortedIds[1]}`;
        let conversation = await Conversation.findOne({ participantsKey });
        if (!conversation)
          conversation = await Conversation.create({
            participants: [currentUserId, targetId],
            participantsKey,
          });

        const msg = await Message.create({
          conversation: conversation._id,
          sender: currentUserId,
          receiver: targetId,
          type: "post",
          text: post.content,
          post: post._id,
        });

        const targetIdStr = targetId.toString();
        setUnreadSafely(
          conversation,
          targetIdStr,
          getUnreadSafely(conversation, targetIdStr) + 1
        ); // 🔒 #7 safe
        conversation.lastMessage = msg._id;
        conversation.lastMessageAt = msg.createdAt;
        if (conversation.hiddenBy?.some((id) => id.toString() === targetIdStr))
          conversation.hiddenBy = conversation.hiddenBy.filter(
            (id) => id.toString() !== targetIdStr
          );
        await conversation.save();

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
            receiver: targetIdStr,
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
          io.to(`user:${targetIdStr}`).emit("new_message", payload);
          io.to(`user:${targetIdStr}`).emit("conversation_updated", {
            conversationId: conversation._id.toString(),
            message: payload,
          });
        }
      } catch (e) {
        console.error("Share delivery failed for target:", e.message);
      }
    }

    await safeLogAudit(req, "post_shared", {
      postId,
      sharedCount: validTargets.length,
    });
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
