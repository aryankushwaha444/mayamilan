import express from "express";

import {
  getMatches,
  getMatchById,
  deleteMatch,
} from "../controllers/match.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getMatches);

router.get("/:matchId", protect, getMatchById);

router.delete("/:matchId", protect, deleteMatch);

export default router;