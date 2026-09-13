import express from "express";
import {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "../controllers/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getNotifications);
router.put("/read-all", protect, markAllAsRead);
router.delete("/", protect, deleteAllNotifications);
router.delete("/:id", protect, deleteNotification); 

export default router;
