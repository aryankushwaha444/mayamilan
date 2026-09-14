import argon2 from "argon2";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";
import { sendOTP } from "../config/email.js";
import { generateOTP, saveOTP, verifyOTP } from "../utils/otp.js";
import { sendPushToMany } from "../utils/push.js"; // 👈 ADD

import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateToken.js";

export const register = async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0].message,
      });
    }

    const { name, email, password, dateOfBirth, gender, relationshipGoal } =
      validation.data;

    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    // Adjust age if birthday hasn't occurred yet this year
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    if (age < 18) {
      return res.status(400).json({
        success: false,
        message: "You must be at least 18 years old to register.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const hashedPassword = await argon2.hash(password);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      dateOfBirth,
      gender,
      relationshipGoal,
    });

    const accessToken = generateAccessToken(user._id.toString());

    const refreshToken = generateRefreshToken(user._id.toString());

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 👇 NEW: Notify recent active users about the new member
    try {
      const audience = await User.find({
        _id: { $ne: user._id },
        isActive: true,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("_id");

      const audienceIds = audience.map((u) => u._id);

      // 👇 PUSH: notify offline users
      sendPushToMany(audienceIds, {
        title: "New member joined 💕",
        body: `${user.name} just joined Maya~Milan`,
        url: `/users/${user._id}`,
      });

      // 👇 SOCKET: notify online users in real-time
      const io = getIO();
      if (io && audienceIds.length > 0) {
        audienceIds.forEach((userId) => {
          io.to(`user:${userId}`).emit("new_member", {
            userId: user._id.toString(),
            name: user.name,
            photos: user.photos || [],
          });
        });
      }
    } catch (pushErr) {
      console.warn("New user notification failed:", pushErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        relationshipGoal: user.relationshipGoal,
        isVerified: user.isVerified,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while creating account",
    });
  }
};

export const login = async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.issues[0].message,
      });
    }

    const { email, password } = validation.data;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const passwordValid = await argon2.verify(user.password, password);

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const accessToken = generateAccessToken(user._id.toString());

    const refreshToken = generateRefreshToken(user._id.toString());

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    user.lastSeen = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        relationshipGoal: user.relationshipGoal,
        isVerified: user.isVerified,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while logging in",
    });
  }
};

export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await RefreshToken.findOneAndUpdate(
        {
          tokenHash: hashToken(refreshToken),
          revokedAt: null,
        },
        {
          revokedAt: new Date(),
        }
      );
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      success: false,
      message: "Logout failed",
    });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (decoded.type !== "refresh") {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    const tokenHash = hashToken(refreshToken);

    // 🔒 Replay detection
    const revokedToken = await RefreshToken.findOne({
      tokenHash,
      revokedAt: { $ne: null },
    });
    if (revokedToken) {
      await RefreshToken.updateMany(
        { user: decoded.userId, revokedAt: null },
        { revokedAt: new Date() }
      );
      return res.status(401).json({
        success: false,
        message: "Token reuse detected — session terminated",
      });
    }

    const storedToken = await RefreshToken.findOne({
      tokenHash,
      user: decoded.userId,
      revokedAt: null,
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) await storedToken.updateOne({ revokedAt: new Date() });
      return res.status(401).json({
        success: false,
        message: "Refresh token expired or revoked",
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "Account unavailable" });
    }

    const newAccessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString());

    await storedToken.updateOne({ revokedAt: new Date() });

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    const isMatch = await argon2.verify(user.password, currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password.",
      });
    }

    const hashedPassword = await argon2.hash(newPassword);
    user.password = hashedPassword;
    await user.save();
    res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change password error:", error);
    next(error);
  }
};

export const sendOTPCode = async (req, res, next) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: "Email and name are required",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified) {
      return res.status(409).json({
        success: false,
        message: "Email already registered and verified",
      });
    }

    const otp = generateOTP();
    await saveOTP(email, otp);

    await sendOTP(email, otp, name);

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    next(error);
  }
};

export const verifyOTPCode = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const result = await verifyOTP(email, otp);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const user = await User.findOne({ email });

    if (user && !user.isVerified) {
      user.isVerified = true;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    const otp = generateOTP();
    await saveOTP(email, otp);

    await sendOTP(email, otp, user.name);

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent to your email",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const result = await verifyOTP(email, otp);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword = await argon2.hash(newPassword);
    user.password = hashedPassword;
    await user.save();

    // Force re-login on all devices
    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    next(error);
  }
};
