import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";
import {
  getUserReports,
  updateReportStatus,
  getAllReports,
} from "../controllers/admin.controller.js";

import {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  deleteUserPhoto,
} from "../controllers/admin.controller.js";

const router = express.Router();

// All admin routes require auth + admin role
router.use(protect);
router.use(isAdmin);

// Dashboard
router.get("/stats", getDashboardStats);

// Users CRUD
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.get("/users/:id/reports", getUserReports);
router.get("/reports", getAllReports);

router.put("/users/:id", updateUser);

router.patch("/users/:id/toggle-status", toggleUserStatus);
router.patch("/reports/:reportId", updateReportStatus);

router.delete("/users/:id", deleteUser);
router.delete("/users/:id/photos/:photoId", deleteUserPhoto);

export default router;
