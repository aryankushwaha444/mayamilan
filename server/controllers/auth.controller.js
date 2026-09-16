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
import { logAudit } from "../utils/auditLogger.js";

import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  generateReactivationToken,
} from "../utils/generateToken.js";

const maskEmail = (email) => {
  try {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    if (local.length <= 4) return `${local[0]}****@${domain}`;
    return `${local.slice(0, 2)}****${local.slice(-2)}@${domain}`;
  } catch {
    return "****@****";
  }
};

// ========================================
// REGISTER
// ========================================
export const register = async (req, res) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ success: false, message: validation.error.issues[0].message });
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
    )
      age--;

    if (age < 18) {
      await logAudit(req, "registration_failed", {
        email,
        reason: "underage",
        age,
      });
      return res
        .status(400)
        .json({
          success: false,
          message: "You must be at least 18 years old to register.",
        });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (
        existingUser.emailBlockedUntil &&
        existingUser.emailBlockedUntil > new Date()
      ) {
        const maskedEmail = maskEmail(email);
        await logAudit(req, "registration_blocked", {
          email,
          reason: "email_temporarily_blocked",
          blockedUntil: existingUser.emailBlockedUntil,
        });
        return res
          .status(403)
          .json({
            success: false,
            message: `You can't create an account with ${maskedEmail}. This email is temporarily blocked.`,
            blocked: true,
            blockedUntil: existingUser.emailBlockedUntil,
          });
      }
      await logAudit(req, "registration_failed", {
        email,
        reason: "email_exists",
      });
      return res
        .status(409)
        .json({
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

    await logAudit(req, "account_created", {
      userId: user._id,
      email: user.email,
      deviceInfo: describeDevice(req),
    });

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
    return res
      .status(500)
      .json({ success: false, message: "Server error while creating account" });
  }
};

// ========================================
// LOGIN
// ========================================
export const login = async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ success: false, message: validation.error.issues[0].message });
    }

    const { email, password } = validation.data;
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      const blockedUser = await User.findOne({
        email,
        emailBlockedUntil: { $gt: new Date() },
      });
      if (blockedUser) {
        const maskedEmail = maskEmail(email);
        await logAudit(req, "login_blocked", {
          email,
          reason: "email_temporarily_blocked",
        });
        return res
          .status(403)
          .json({
            success: false,
            message: `You can't create an account with ${maskedEmail}. This email is temporarily blocked.`,
            blocked: true,
          });
      }
      await logAudit(req, "login_failed", { email, reason: "user_not_found" });
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Handle deactivated accounts (soft-deleted with grace period)
    if (user.deletedAt) {
      const now = new Date();

      if (now > user.scheduledDeletionAt) {
        await logAudit(req, "login_failed", {
          email,
          userId: user._id,
          reason: "grace_period_expired",
        });
        return res
          .status(410)
          .json({
            success: false,
            message:
              "Your account has been permanently deleted. You cannot log in.",
            deleted: true,
          });
      }

      const currentAttempts = Number(user.reactivationAttempts) || 0;
      if (currentAttempts >= 3) {
        const maskedEmail = maskEmail(email);
        await logAudit(req, "login_blocked", {
          email,
          userId: user._id,
          reason: "max_reactivation_attempts",
        });
        return res
          .status(403)
          .json({
            success: false,
            message: `You can't create an account with ${maskedEmail}. Too many reactivation attempts.`,
            deactivated: true,
            blocked: true,
          });
      }

      // ✅ Compute remaining BEFORE incrementing (fixes off-by-one)
      const attemptsRemaining = 3 - currentAttempts;

      // OAuth users have no password — direct them to Google button
      if (user.oauthProvider && user.oauthProvider !== "local") {
        const daysRemaining = Math.ceil(
          (user.scheduledDeletionAt - now) / (1000 * 60 * 60 * 24)
        );
        return res.status(403).json({
          success: false,
          message:
            "This account uses Google sign-in. Click 'Continue with Google' below to reactivate it.",
          deactivated: true,
          canReactivate: false,
          useGoogle: true,
          daysRemaining,
          attemptsRemaining,
        });
      }

      const passwordValid = await argon2.verify(user.password, password);
      if (!passwordValid) {
        await logAudit(req, "login_failed", {
          email,
          userId: user._id,
          reason: "wrong_password",
        });
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      // ✅ Atomic increment — no stale save issues
      await User.updateOne(
        { _id: user._id },
        { $inc: { reactivationAttempts: 1 } }
      );
      console.log(
        "🔢 Login reactivation counter:",
        currentAttempts,
        "→",
        currentAttempts + 1,
        "for",
        email
      );

      const daysRemaining = Math.ceil(
        (user.scheduledDeletionAt - now) / (1000 * 60 * 60 * 24)
      );

      await logAudit(req, "login_deactivated", {
        email,
        userId: user._id,
        daysRemaining,
        attemptsRemaining,
      });

      return res.status(403).json({
        success: false,
        message: `Your account is deactivated. It will be permanently deleted in ${daysRemaining} days.`,
        deactivated: true,
        canReactivate: true,
        daysRemaining,
        attemptsRemaining,
        userId: user._id,
        reactivationToken: generateReactivationToken(user._id.toString()),
      });
    }

    if (!user.isActive) {
      await logAudit(req, "login_failed", {
        email,
        userId: user._id,
        reason: "account_inactive",
      });
      return res
        .status(403)
        .json({ success: false, message: "Your account is inactive" });
    }

    const passwordValid = await argon2.verify(user.password, password);
    if (!passwordValid) {
      await logAudit(req, "login_failed", {
        email,
        userId: user._id,
        reason: "wrong_password",
      });
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
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
    return res
      .status(500)
      .json({ success: false, message: "Server error while logging in" });
  }
};

export const getMe = async (req, res) =>
  res.status(200).json({ success: true, user: req.user });

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await RefreshToken.findOneAndUpdate(
        { tokenHash: hashToken(refreshToken), revokedAt: null },
        { revokedAt: new Date() }
      );
    }
    if (req.user)
      await logAudit(req, "logout", {
        userId: req.user._id,
        email: req.user.email,
      });
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });
    return res
      .status(200)
      .json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res
        .status(401)
        .json({ success: false, message: "Refresh token missing" });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== "refresh")
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token type" });

    const tokenHash = hashToken(refreshToken);
    const revokedToken = await RefreshToken.findOne({
      tokenHash,
      revokedAt: { $ne: null },
    });
    if (revokedToken) {
      await RefreshToken.updateMany(
        { user: decoded.userId, revokedAt: null },
        { revokedAt: new Date() }
      );
      await logAudit(req, "token_replay_detected", {
        userId: decoded.userId,
        action: "all_sessions_revoked",
      });
      console.warn(
        `🚨 TOKEN REPLAY: user ${decoded.userId} — revoked all sessions`
      );
      return res
        .status(401)
        .json({
          success: false,
          message: "Token reuse detected — all sessions terminated",
        });
    }

    const storedToken = await RefreshToken.findOne({
      tokenHash,
      user: decoded.userId,
      revokedAt: null,
    });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) await storedToken.updateOne({ revokedAt: new Date() });
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired or revoked" });
    }

    const deviceId = getDeviceId(req);
    const currentFingerprint = deviceId ? deviceFingerprint(deviceId) : null;
    if (
      storedToken.deviceFingerprint &&
      currentFingerprint &&
      currentFingerprint !== storedToken.deviceFingerprint
    ) {
      await RefreshToken.updateMany(
        { user: decoded.userId, revokedAt: null },
        { revokedAt: new Date() }
      );
      await logAudit(req, "device_mismatch_detected", {
        userId: decoded.userId,
        expectedDevice: storedToken.deviceInfo,
        actualDevice: describeDevice(req),
        action: "all_sessions_revoked",
      });
      console.warn(`🚨 DEVICE MISMATCH: user ${decoded.userId}`);
      return res
        .status(401)
        .json({
          success: false,
          message:
            "Unrecognized device detected. All sessions revoked for your safety.",
        });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive)
      return res
        .status(401)
        .json({ success: false, message: "Account unavailable" });

    const newAccessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString());
    await storedToken.updateOne({ revokedAt: new Date() });
    await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      deviceFingerprint: storedToken.deviceFingerprint || currentFingerprint,
      deviceInfo: describeDevice(req),
      lastUsedAt: new Date(),
      lastIp: req.ip,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }
};

// ========================================
// REACTIVATE ACCOUNT (PUBLIC — one-time token)
// ========================================
export const reactivateAccount = async (req, res) => {
  try {
    const { reactivationToken } = req.body;
    if (!reactivationToken) {
      return res
        .status(400)
        .json({ success: false, message: "Reactivation token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(reactivationToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Reactivation link expired. Please login again.",
        });
    }

    if (decoded.type !== "reactivation") {
      return res
        .status(401)
        .json({ success: false, message: "Invalid reactivation token" });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.deletedAt) {
      return res
        .status(400)
        .json({ success: false, message: "Account is not deactivated" });
    }

    const now = new Date();
    if (now > user.scheduledDeletionAt) {
      return res
        .status(410)
        .json({
          success: false,
          message:
            "Grace period expired. Account has been permanently deleted.",
        });
    }

    // ✅ SINGLE ATOMIC UPDATE — no duplicate user.save() that could revert it
    const result = await User.updateOne(
      { _id: user._id, deletedAt: { $ne: null } },
      {
        $set: {
          isActive: true,
          deletedAt: null,
          scheduledDeletionAt: null,
          reactivationAttempts: 0,
          lastSeen: now,
        },
      }
    );

    console.log("🔧 Reactivate DB result:", {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      email: user.email,
    });

    if (result.modifiedCount === 0) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Account state changed. Please login again.",
        });
    }

    // Issue full session tokens (reactivate + login in one step)
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

    try {
      await logAudit(req, "account_reactivated", {
        userId: user._id,
        email: user.email,
      });
    } catch (e) {
      console.warn("Audit log skipped:", e.message);
    }

    return res.status(200).json({
      success: true,
      message: "Welcome back! Your account has been reactivated.",
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
    console.error("Reactivation error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reactivate account" });
  }
};

// ========================================
// CHANGE PASSWORD
// ========================================
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res
        .status(400)
        .json({
          success: false,
          message: "Current password and new password are required.",
        });
    if (newPassword.length < 6)
      return res
        .status(400)
        .json({
          success: false,
          message: "New password must be at least 6 characters.",
        });

    const user = await User.findById(req.user._id).select("+password");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found." });

    const isMatch = await argon2.verify(user.password, currentPassword);
    if (!isMatch) {
      await logAudit(req, "password_change_failed", {
        userId: user._id,
        reason: "wrong_current_password",
      });
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect." });
    }

    if (currentPassword === newPassword)
      return res
        .status(400)
        .json({
          success: false,
          message: "New password must be different from current password.",
        });

    const hashedPassword = await argon2.hash(newPassword);
    user.password = hashedPassword;
    await user.save();

    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );
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

    return res
      .status(200)
      .json({
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
    if (!email || !name)
      return res
        .status(400)
        .json({ success: false, message: "Email and name are required" });
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified)
      return res
        .status(409)
        .json({
          success: false,
          message: "Email already registered and verified",
        });
    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendOTP(email, otp, name);
    await logAudit(req, "otp_sent", { email, type: "registration" });
    return res
      .status(200)
      .json({ success: true, message: "OTP sent to your email" });
  } catch (error) {
    console.error("Send OTP error:", error);
    next(error);
  }
};

export const verifyOTPCode = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    const result = await verifyOTP(email, otp);
    if (!result.valid) {
      await logAudit(req, "otp_verification_failed", {
        email,
        reason: result.message,
      });
      return res.status(400).json({ success: false, message: result.message });
    }
    const user = await User.findOne({ email });
    if (user && !user.isVerified) {
      user.isVerified = true;
      await user.save();
      await logAudit(req, "email_verified", { email, userId: user._id });
    }
    return res
      .status(200)
      .json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    console.error("Verify OTP error:", error);
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "No account found with this email" });
    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendOTP(email, otp, user.name);
    await logAudit(req, "password_reset_requested", {
      email,
      userId: user._id,
    });
    return res
      .status(200)
      .json({
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
    if (!email || !otp || !newPassword)
      return res
        .status(400)
        .json({
          success: false,
          message: "Email, OTP and new password are required",
        });
    if (newPassword.length < 8)
      return res
        .status(400)
        .json({
          success: false,
          message: "Password must be at least 8 characters",
        });
    const result = await verifyOTP(email, otp);
    if (!result.valid)
      return res.status(400).json({ success: false, message: result.message });
    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    const hashedPassword = await argon2.hash(newPassword);
    user.password = hashedPassword;
    await user.save();
    await RefreshToken.updateMany(
      { user: user._id, revokedAt: null },
      { revokedAt: new Date() }
    );
    await logAudit(req, "password_reset_success", {
      email,
      userId: user._id,
      allSessionsRevoked: true,
    });
    return res
      .status(200)
      .json({
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
    return res.status(200).json({ success: true, sessions });
  } catch (error) {
    console.error("Get sessions error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load sessions" });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const token = await RefreshToken.findOne({
      _id: req.params.sessionId,
      user: req.user._id,
    });
    if (!token)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    token.revokedAt = new Date();
    await token.save();
    await logAudit(req, "session_revoked", {
      userId: req.user._id,
      sessionId: req.params.sessionId,
      deviceInfo: token.deviceInfo,
    });
    return res.status(200).json({ success: true, message: "Session revoked" });
  } catch (error) {
    console.error("Revoke session error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to revoke session" });
  }
};

export const revokeAllOtherSessions = async (req, res) => {
  try {
    const currentRefreshToken = req.cookies.refreshToken;
    const currentHash = currentRefreshToken
      ? hashToken(currentRefreshToken)
      : null;
    const result = await RefreshToken.updateMany(
      { user: req.user._id, revokedAt: null, tokenHash: { $ne: currentHash } },
      { revokedAt: new Date() }
    );
    await logAudit(req, "all_other_sessions_revoked", {
      userId: req.user._id,
      sessionsRevoked: result.modifiedCount,
    });
    return res
      .status(200)
      .json({ success: true, message: "All other sessions revoked" });
  } catch (error) {
    console.error("Revoke all sessions error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to revoke sessions" });
  }
};
