import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import { cached } from "../utils/cache.js";
import {
  postLimiter,
  commentLimiter,
  reactionLimiter,
  uploadLimiter,
} from "../middleware/rateLimits.js"; // ✅

import {
  createPost,
  getFeed,
  getMyPosts,
  getSavedPosts,
  getPostById,
  editPost,
  deletePost,
  toggleLike,
  toggleSave,
  addComment,
  getComments,
  deleteComment,
  addReply,
  getReplies,
  toggleReaction,
  getShareTargets,
  sharePost,
} from "../controllers/post.controller.js";

const router = express.Router();

router.use(protect);

// Posts — limit only on creation
router.post(
  "/",
  uploadLimiter,
  upload.array("images", 5),
  postLimiter,
  createPost
); // ✅ both
router.get("/", cached("feed", 120), getFeed);
router.get("/my", cached("my-posts", 30), getMyPosts);
router.get("/saved", cached("saved-posts", 30), getSavedPosts);
router.get("/share-targets", getShareTargets);
router.get("/:id", cached("post", 60), getPostById);
router.put("/:id", editPost);
router.delete("/:id", deletePost);

// Interactions — limit reactions
router.post("/:id/like", reactionLimiter, toggleLike); // ✅
router.post("/:id/save", toggleSave); // saves are unlimited
router.post("/:id/share", sharePost);

// Comments — limit creation
router.get("/:id/comments", cached("comments", 15), getComments);
router.post("/:id/comments", commentLimiter, addComment); // ✅
router.delete("/:id/comments/:commentId", deleteComment);
router.get(
  "/:id/comments/:commentId/replies",
  cached("replies", 15),
  getReplies
);
router.post("/:id/comments/:commentId/replies", commentLimiter, addReply); // ✅
router.post("/comments/:commentId/reactions", reactionLimiter, toggleReaction); // ✅

export default router;
