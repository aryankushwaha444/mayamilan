import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import { cached } from "../utils/cache.js";
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
  getShareTargets, // 👈 ADD THIS
  sharePost, // 👈 ADD THIS
} from "../controllers/post.controller.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Posts
router.post("/", upload.array("images", 5), createPost);
router.get("/",cached("feed", 120), getFeed);
router.get("/my",cached("my-posts", 30), getMyPosts);
router.get("/saved",cached("saved-posts", 30), getSavedPosts);
router.get("/share-targets", getShareTargets);
router.get("/:id",cached("post", 60), getPostById);
router.put("/:id", editPost);
router.delete("/:id", deletePost);

// Interactions
router.post("/:id/like", toggleLike);
router.post("/:id/save", toggleSave);
router.post("/:id/share", sharePost);

// Comments
router.get("/:id/comments",cached("comments", 15), getComments);
router.post("/:id/comments", addComment);
router.delete("/:id/comments/:commentId", deleteComment);
router.get("/:id/comments/:commentId/replies",cached("replies", 15), getReplies);
router.post("/:id/comments/:commentId/replies", addReply);
router.post("/comments/:commentId/reactions", toggleReaction);

export default router;
