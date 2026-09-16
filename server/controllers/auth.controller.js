import argon2 from "argon2";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { registerSchema, loginSchema } from "../validators/auth.validator.js";
import { sendOTP } from "../config/email.js";
import { generateOTP, saveOTP, verifyOTP } from "../utils/otp.js";
import { sendPushToMany } from "../utils/push.js";
import { getIO } from "../sockets/socket.js";
import {
  getDeviceId,
  deviceFingerprint,
  describeDevice,
} from "../utils/device.js";
import { logAudit } from "../utils/auditLogger.js"; // ✅ ADD THIS IMPORT

import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../utils/generateToken.js";

// ========================================
// REGISTER
// ========================================

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

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    if (age < 18) {
      // ✅ AUDIT: Log underage registration attempt
      await logAudit(req, "registration_failed", {
        email,
        reason: "underage",
        age,
      });

      return res.status(400).json({
        success: false,
        message: "You must be at least 18 years old to register.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      // ✅ AUDIT: Log duplicate registration attempt
      await logAudit(req, "registration_failed", {
        email,
        reason: "email_exists",
      });

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

    const deviceId = getDeviceId(req);

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceFingerprint: deviceId ? deviceFingerprint(deviceId) : null,
      deviceInfo: describeDevice(req),
      lastUsedAt: new Date(),
      lastIp: req.ip,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    // ✅ AUDIT: Log successful registration
    await logAudit(req, "account_created", {
      userId: user._id,
      email: user.email,
      deviceInfo: describeDevice(req),
    });

    // Notify recent active users about the new member
    try {
      const audience = await User.find({
        _id: { $ne: user._id },
        isActive: true,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("_id");

      const audienceIds = audience.map((u) => u._id);

      sendPushToMany(audienceIds, {
        title: "New member joined 💕",
        body: `${user.name} just joined Maya~Milan`,
        url: `/users/${user._id}`,
      });

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

// ========================================
// LOGIN
// ========================================

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
      // ✅ AUDIT: Log failed login - user not found
      await logAudit(req, "login_failed", {
        email,
        reason: "user_not_found",
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      // ✅ AUDIT: Log failed login - inactive account
      await logAudit(req, "login_failed", {
        email,
        userId: user._id,
        reason: "account_inactive",
      });

      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    const passwordValid = await argon2.verify(user.password, password);

    if (!passwordValid) {
      // ✅ AUDIT: Log failed login - wrong password
      await logAudit(req, "login_failed", {
        email,
        userId: user._id,
        reason: "wrong_password",
      });

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    const deviceId = getDeviceId(req);

    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceFingerprint: deviceId ? deviceFingerprint(deviceId) : null,
      deviceInfo: describeDevice(req),
      lastUsedAt: new Date(),
      lastIp: req.ip,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    user.lastSeen = new Date();
    await user.save();

    // ✅ AUDIT: Log successful login BEFORE returning (CRITICAL FIX!)
    await logAudit(req, "login_success", {
      email: user.email,
      userId: user._id,
      deviceInfo: describeDevice(req),
      ip: req.ip,
    });

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

// ========================================
// GET CURRENT USER
// ========================================

export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
};

// ========================================
// LOGOUT
// ========================================

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

    // ✅ AUDIT: Log logout
    if (req.user) {
      await logAudit(req, "logout", {
        userId: req.user._id,
        email: req.user.email,
      });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
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

// ========================================
// REFRESH ACCESS TOKEN (FIXED ORDER)
// ========================================

export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    // 1. Verify JWT signature first
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token type",
      });
    }

    const tokenHash = hashToken(refreshToken);

    // 2. Replay detection — check if token was already used
    const revokedToken = await RefreshToken.findOne({
      tokenHash,
      revokedAt: { $ne: null },
    });

    if (revokedToken) {
      // Token reuse detected — attacker replaying it!
      await RefreshToken.updateMany(
        { user: decoded.userId, revokedAt: null },
        { revokedAt: new Date() }
      );

      // ✅ AUDIT: Log token replay attack
      await logAudit(req, "token_replay_detected", {
        userId: decoded.userId,
        action: "all_sessions_revoked",
      });

      console.warn(
        `🚨 TOKEN REPLAY: user ${decoded.userId} — revoked all sessions`
      );
      return res.status(401).json({
        success: false,
        message: "Token reuse detected — all sessions terminated",
      });
    }

    // 3. Find valid stored token
    const storedToken = await RefreshToken.findOne({
      tokenHash,
      user: decoded.userId,
      revokedAt: null,
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await storedToken.updateOne({ revokedAt: new Date() });
      }
      return res.status(401).json({
        success: false,
        message: "Refresh token expired or revoked",
      });
    }

    // 4. ✅ DEVICE BINDING CHECK (after storedToken is defined!)
    const deviceId = getDeviceId(req);
    const currentFingerprint = deviceId ? deviceFingerprint(deviceId) : null;

    if (
      storedToken.deviceFingerprint && // session was bound
      currentFingerprint && // client sent a device id
      currentFingerprint !== storedToken.deviceFingerprint // MISMATCH
    ) {
      // Revoke ALL of this user's sessions
      await RefreshToken.updateMany(
        { user: decoded.userId, revokedAt: null },
        { revokedAt: new Date() }
      );

      // ✅ AUDIT: Log device mismatch attack
      await logAudit(req, "device_mismatch_detected", {
        userId: decoded.userId,
        expectedDevice: storedToken.deviceInfo,
        actualDevice: describeDevice(req),
        action: "all_sessions_revoked",
      });

      console.warn(
        `🚨 DEVICE MISMATCH: user ${decoded.userId} — refresh token used from unknown device. Revoking all sessions.`
      );

      return res.status(401).json({
        success: false,
        message:
          "Unrecognized device detected. All sessions revoked for your safety.",
      });
    }

    // 5. Verify user still exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account unavailable",
      });
    }

    // 6. Generate new tokens (rotation)
    const newAccessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString());

    // 7. Revoke old token
    await storedToken.updateOne({ revokedAt: new Date() });

    // 8. Create new token with device binding preserved
    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceFingerprint: storedToken.deviceFingerprint || currentFingerprint,
      deviceInfo: describeDevice(req),
      lastUsedAt: new Date(),
      lastIp: req.ip,
    });

    // 9. Set new cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

// ========================================
// CHANGE PASSWORD
// ========================================

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
      // ✅ AUDIT: Log wrong current password attempt
      await logAudit(req, "password_change_failed", {
        userId: user._id,
        reason: "wrong_current_password",
      });

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

    // Revoke all sessions (force re-login everywhere after password change)
    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );

    // ✅ AUDIT: Log successful password change
    await logAudit(req, "password_changed", {
      userId: user._id,
      allSessionsRevoked: true,
      deviceInfo: describeDevice(req),
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message:
        "Password changed successfully. Please log in again on all devices.",
    });
  } catch (error) {
    console.error("Change password error:", error);
    next(error);
  }
};

// ========================================
// OTP FUNCTIONS
// ========================================

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

    // ✅ AUDIT: Log OTP sent
    await logAudit(req, "otp_sent", { email, type: "registration" });

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
      // ✅ AUDIT: Log failed OTP verification
      await logAudit(req, "otp_verification_failed", {
        email,
        reason: result.message,
      });

      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const user = await User.findOne({ email });

    if (user && !user.isVerified) {
      user.isVerified = true;
      await user.save();

      // ✅ AUDIT: Log successful email verification
      await logAudit(req, "email_verified", { email, userId: user._id });
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

    // ✅ AUDIT: Log password reset request
    await logAudit(req, "password_reset_requested", {
      email,
      userId: user._id,
    });

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

    // ✅ AUDIT: Log successful password reset
    await logAudit(req, "password_reset_success", {
      email,
      userId: user._id,
      allSessionsRevoked: true,
    });

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

// ========================================
// SESSION MANAGEMENT
// ========================================

export const getSessions = async (req, res) => {
  try {
    const sessions = await RefreshToken.find({
      user: req.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("deviceInfo lastUsedAt lastIp createdAt")
      .sort({ lastUsedAt: -1 })
      .lean();

    res.status(200).json({ success: true, sessions });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load sessions",
    });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const token = await RefreshToken.findOne({
      _id: req.params.sessionId,
      user: req.user._id,
    });

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    token.revokedAt = new Date();
    await token.save();

    // ✅ AUDIT: Log session revocation
    await logAudit(req, "session_revoked", {
      userId: req.user._id,
      sessionId: req.params.sessionId,
      deviceInfo: token.deviceInfo,
    });

    res.status(200).json({ success: true, message: "Session revoked" });
  } catch (error) {
    console.error("Revoke session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke session",
    });
  }
};

export const revokeAllOtherSessions = async (req, res) => {
  try {
    const currentRefreshToken = req.cookies.refreshToken;
    const currentHash = currentRefreshToken
      ? hashToken(currentRefreshToken)
      : null;

    const result = await RefreshToken.updateMany(
      {
        user: req.user._id,
        revokedAt: null,
        tokenHash: { $ne: currentHash },
      },
      { revokedAt: new Date() }
    );

    // ✅ AUDIT: Log all other sessions revoked
    await logAudit(req, "all_other_sessions_revoked", {
      userId: req.user._id,
      sessionsRevoked: result.modifiedCount,
    });

    res.status(200).json({
      success: true,
      message: "All other sessions revoked",
    });
  } catch (error) {
    console.error("Revoke all sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to revoke sessions",
    });
  }
};
