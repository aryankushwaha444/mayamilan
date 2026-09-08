import express from "express";

import {
  getMyProfile,
  updateMyProfile,
  getUserProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  setPrimaryPhoto,
} from "../controllers/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";
import { reportUser, toggleBlock, getBlockStatus } from "../controllers/user.controller.js";


const router = express.Router();

// CURRENT USER
router.get("/me", protect, getMyProfile);
router.put("/me", protect, updateMyProfile);
router.post("/me/photos", protect, upload.single("photo"), uploadProfilePhoto);
router.delete("/me/photos/:photoId", protect, deleteProfilePhoto);
router.put("/me/photos/:photoId/primary", protect, setPrimaryPhoto);

// OTHER USER
router.get("/:userId", protect, getUserProfile);
router.post("/:userId/report", protect, reportUser);
router.post("/:userId/block", protect, toggleBlock);
router.get("/:userId/block-status", protect, getBlockStatus);

export default router;
