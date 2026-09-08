import User from "../models/User.js";
import cloudinary from "../config/cloudinary.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";
import Report from "../models/Report.js";

/*
GET MY PROFILE
GET /api/users/me
*/

export const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      user,
    });
  } catch (error) {
    next(error);
  }
};

/*
UPDATE MY PROFILE
PUT /api/users/me
*/

export const updateMyProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      "name",
      "dateOfBirth",
      "gender",
      "bio",
      "occupation",
      "education",
      "interests",
      "relationshipGoal",
      "preferences",
      "location",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/*
GET OTHER USER PROFILE
GET /api/users/:userId
*/

export const getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const user = await User.findById(userId).select("-password -refreshToken");

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if current user has liked this profile
    const sentLike = await Like.findOne({
      from: currentUserId,
      to: userId,
    });

    // Check if they are matched
    const sortedIds = [currentUserId.toString(), userId.toString()].sort();
    const pairKey = `${sortedIds[0]}_${sortedIds[1]}`;

    const match = await Match.findOne({ pairKey });

    return res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        isLiked: Boolean(sentLike),
        isMatched: Boolean(match),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please select an image",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (user.photos.length >= 6) {
      return res.status(400).json({
        message: "You can upload a maximum of 6 photos",
      });
    }

    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "dating-portal/profile-photos",
            resource_type: "image",
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        stream.end(req.file.buffer);
      });
    };

    const result = await uploadToCloudinary();

    const isPrimary = user.photos.length === 0;

    user.photos.push({
      url: result.secure_url,
      publicId: result.public_id,
      isPrimary,
    });

    await user.save();

    res.status(201).json({
      message: "Profile photo uploaded successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProfilePhoto = async (req, res, next) => {
  try {
    const { photoId } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const photo = user.photos.id(photoId);

    if (!photo) {
      return res.status(404).json({
        message: "Photo not found",
      });
    }

    // Delete image from Cloudinary
    await cloudinary.uploader.destroy(photo.publicId);

    const wasPrimary = photo.isPrimary;

    // Remove photo from MongoDB
    user.photos.pull(photoId);

    // If primary photo was deleted, make another photo primary
    if (wasPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();

    res.status(200).json({
      message: "Profile photo deleted successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

export const setPrimaryPhoto = async (req, res, next) => {
  try {
    const { photoId } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const photoExists = user.photos.id(photoId);

    if (!photoExists) {
      return res.status(404).json({
        message: "Photo not found",
      });
    }

    // Make every photo non-primary
    user.photos.forEach((photo) => {
      photo.isPrimary = false;
    });

    // Make selected photo primary
    photoExists.isPrimary = true;

    await user.save();

    res.status(200).json({
      message: "Primary photo updated successfully",
      photos: user.photos,
    });
  } catch (error) {
    next(error);
  }
};

export const reportUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Report message is required",
      });
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot report yourself",
      });
    }

    const target = await User.findById(userId);
    if (!target) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    await Report.findOneAndUpdate(
      { reporter: req.user._id, reportedUser: userId },
      { message: message.trim(), status: "pending" },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Report submitted. Our team will review it.",
    });
  } catch (error) {
    next(error);
  }
};

/*
BLOCK / UNBLOCK USER
POST /api/users/:userId/block
*/
export const toggleBlock = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself",
      });
    }

    const me = await User.findById(req.user._id);
    const alreadyBlocked = me.blockedUsers.some(
      (id) => id.toString() === userId
    );

    if (alreadyBlocked) {
      me.blockedUsers = me.blockedUsers.filter(
        (id) => id.toString() !== userId
      );
    } else {
      me.blockedUsers.push(userId);
    }

    await me.save();

    res.status(200).json({
      success: true,
      blocked: !alreadyBlocked,
      message: !alreadyBlocked
        ? "User blocked successfully"
        : "User unblocked successfully",
    });
  } catch (error) {
    next(error);
  }
};

/*
BLOCK STATUS
GET /api/users/:userId/block-status
*/
export const getBlockStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const me = await User.findById(req.user._id).select("blockedUsers");
    const other = await User.findById(userId).select("blockedUsers");

    res.status(200).json({
      success: true,
      iBlocked: me.blockedUsers.some((id) => id.toString() === userId),
      blockedMe:
        other?.blockedUsers.some(
          (id) => id.toString() === req.user._id.toString()
        ) || false,
    });
  } catch (error) {
    next(error);
  }
};
