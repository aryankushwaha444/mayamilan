import express from "express";
import { discoverUsers } from "../controllers/discovery.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, discoverUsers);

export default router;