import express from "express";
import { param } from "express-validator";
import { protect } from "../middleware/auth.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { jsonLimit } from "../middleware/bodyLimit.js";
import upload from "../middleware/upload.middleware.js";

import {
  postLimiter,
  commentLimiter,
  reactionLimiter,
  uploadLimiter,
} from "../middleware/rateLimits.js";

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

const validateObjectId = (paramName) =>
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`)
    .trim();

router.use(protect);

// POSTS CRUD
router.post(
  "/",
  uploadLimiter,
  upload.array("images", 5),
  postLimiter,
  createPost
);

router.get("/", getFeed);
router.get("/my", getMyPosts);
router.get("/saved", getSavedPosts);
router.get("/share-targets", getShareTargets);

router.get("/:id", [validateObjectId("id")], validateRequest, getPostById);

router.put(
  "/:id",
  postLimiter, // ✅ ADDED: Rate limit edits
  jsonLimit("5kb"),
  [validateObjectId("id")],
  validateRequest,
  editPost
);

router.delete(
  "/:id",
  postLimiter, // ✅ ADDED: Rate limit deletes
  jsonLimit("100b"),
  [validateObjectId("id")],
  validateRequest,
  deletePost
);

// INTERACTIONS
router.post(
  "/:id/like",
  reactionLimiter,
  jsonLimit("100b"),
  [validateObjectId("id")],
  validateRequest,
  toggleLike
);

router.post(
  "/:id/save",
  reactionLimiter,
  jsonLimit("100b"),
  [validateObjectId("id")],
  validateRequest,
  toggleSave
);

router.post(
  "/:id/share",
  postLimiter,
  jsonLimit("2kb"),
  [validateObjectId("id")],
  validateRequest,
  sharePost
);

// COMMENTS & REPLIES
router.get(
  "/:id/comments",
  [validateObjectId("id")],
  validateRequest,
  getComments
);

router.post(
  "/:id/comments",
  commentLimiter,
  jsonLimit("2kb"),
  [validateObjectId("id")],
  validateRequest,
  addComment
);

router.delete(
  "/:id/comments/:commentId",
  commentLimiter, // ✅ ADDED: Rate limit comment deletes
  jsonLimit("100b"),
  [validateObjectId("id"), validateObjectId("commentId")],
  validateRequest,
  deleteComment
);

router.get(
  "/:id/comments/:commentId/replies",
  [validateObjectId("id"), validateObjectId("commentId")],
  validateRequest,
  getReplies
);

router.post(
  "/:id/comments/:commentId/replies",
  commentLimiter,
  jsonLimit("2kb"),
  [validateObjectId("id"), validateObjectId("commentId")],
  validateRequest,
  addReply
);

router.post(
  "/comments/:commentId/reactions",
  reactionLimiter,
  jsonLimit("500b"),
  [validateObjectId("commentId")],
  validateRequest,
  toggleReaction
);

export default router;
