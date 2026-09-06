import express from "express";

import {
  likeUser,
  unlikeUser,
  getSentLikes,
  getReceivedLikes,
} from "../controllers/like.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/:userId", protect, likeUser);

router.delete("/:userId", protect, unlikeUser);

router.get("/sent", protect, getSentLikes);

router.get("/received", protect, getReceivedLikes);

export default router;
