import express from "express";
import {
  submitSuggestion,
  getSuggestions,
  updateSuggestionStatus,
  deleteSuggestion,
} from "../controllers/suggestion.controller.js";
import { protect, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public — anyone can submit
router.post("/", submitSuggestion);

// Admin only — view, update status, delete
router.get("/", protect, adminOnly, getSuggestions);
router.patch("/:id", protect, adminOnly, updateSuggestionStatus);
router.delete("/:id", protect, adminOnly, deleteSuggestion);

export default router;
