import argon2 from "argon2";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";

import { registerSchema, loginSchema } from "../validators/auth.validator.js";

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
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    const tokenHash = hashToken(refreshToken);

    const storedToken = await RefreshToken.findOne({
      tokenHash,
      user: decoded.userId,
      revokedAt: null,
    });

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is invalid or revoked",
      });
    }

    if (storedToken.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Refresh token has expired",
      });
    }

    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable",
      });
    }

    const newAccessToken = generateAccessToken(user._id.toString());

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
};
