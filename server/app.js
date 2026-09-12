import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import discoveryRoutes from "./routes/discovery.routes.js";
import likeRoutes from "./routes/like.routes.js";
import matchRoutes from "./routes/match.routes.js";
import messageRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import suggestionRoutes from "./routes/suggestion.routes.js";
import passport from "./config/passport.js";
import postRoutes from "./routes/post.routes.js";


const app = express();

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.set("trust proxy", 1);

// SECURITY
app.use(helmet());

// BODY PARSER
app.use(express.json());
app.use(passport.initialize());
app.use(express.urlencoded({ extended: true }));

// COOKIE
app.use(cookieParser());


// RATE LIMIT
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // General API limit
  max: 1000,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },

  // Authentication routes have their own limits
  skip: (req) => req.path.startsWith("/auth"),
});

app.use("/api", limiter);

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Dating Portal API is running",
  });
});

// ROUTES
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/posts", postRoutes);

// admin routes
app.use("/api/admin", adminRoutes);

export default app;
