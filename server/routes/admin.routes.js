import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { isAdmin } from "../middleware/admin.middleware.js";

// ✅ Consolidated single import statement
import {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  deleteUserPhoto,
  getUserReports,
  updateReportStatus,
  getAllReports,
  getHoneypotStats, // ✅ ADD THIS
} from "../controllers/admin.controller.js";

const router = express.Router();

// ========================================
// GLOBAL MIDDLEWARE (applies to ALL routes below)
// ========================================
router.use(protect);
router.use(isAdmin);

// ========================================
// DASHBOARD
// ========================================
router.get("/stats", getDashboardStats);
router.get("/stats/honeypot", getHoneypotStats); // ✅ FIXED: removed redundant protect + adminOnly

// ========================================
// USERS CRUD
// ========================================
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.get("/users/:id/reports", getUserReports);
router.put("/users/:id", updateUser);
router.patch("/users/:id/toggle-status", toggleUserStatus);
router.delete("/users/:id", deleteUser);
router.delete("/users/:id/photos/:photoId", deleteUserPhoto);

// ========================================
// REPORTS
// ========================================
router.get("/reports", getAllReports);
router.patch("/reports/:reportId", updateReportStatus);

export default router;
