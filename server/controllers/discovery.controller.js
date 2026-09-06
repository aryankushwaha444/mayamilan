import User from "../models/User.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";

export const discoverUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      minAge,
      maxAge,
      gender,
      city,
      relationshipGoal,
      interests,
    } = req.query;

    const currentUser = req.user;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);

    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    const skip = (pageNumber - 1) * limitNumber;

    // ==========================================
    // USER QUERY
    // ==========================================

    const query = {
      _id: {
        $ne: currentUser._id,
      },
      isActive: true,
    };

    // Gender
    if (gender) {
      query.gender = gender;
    }

    // City
    if (city) {
      query["location.city"] = {
        $regex: city,
        $options: "i",
      };
    }

    // Relationship goal
    if (relationshipGoal) {
      query.relationshipGoal = relationshipGoal;
    }

    // Age
    if (minAge || maxAge) {
      const today = new Date();

      query.dateOfBirth = {};

      if (maxAge) {
        const oldestDate = new Date(today);

        oldestDate.setFullYear(today.getFullYear() - Number(maxAge) - 1);

        query.dateOfBirth.$gte = oldestDate;
      }

      if (minAge) {
        const youngestDate = new Date(today);

        youngestDate.setFullYear(today.getFullYear() - Number(minAge));

        query.dateOfBirth.$lte = youngestDate;
      }
    }

    // Interests
    if (interests) {
      const interestList = interests
        .split(",")
        .map((interest) => interest.trim())
        .filter(Boolean);

      if (interestList.length > 0) {
        query.interests = {
          $in: interestList,
        };
      }
    }

    // ==========================================
    // FETCH USERS
    // ==========================================

    const [users, total] = await Promise.all([
      User.find(query)
        .select(
          "name dateOfBirth gender bio photos location occupation education interests relationshipGoal isVerified isOnline lastSeen"
        )
        .sort({
          isOnline: -1,
          lastSeen: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      User.countDocuments(query),
    ]);

    // ==========================================
    // GET CURRENT USER'S LIKES
    // ==========================================

    const userIds = users.map((user) => user._id);

    const sentLikes = await Like.find({
      from: currentUser._id,
      to: {
        $in: userIds,
      },
    })
      .select("to")
      .lean();

    const likedUserIds = new Set(sentLikes.map((like) => like.to.toString()));

    // ==========================================
    // GET CURRENT USER'S MATCHES
    // ==========================================

    const matches = await Match.find({
      users: currentUser._id,
    })
      .select("users")
      .lean();

    const matchedUserIds = new Set();

    matches.forEach((match) => {
      match.users.forEach((userId) => {
        if (userId.toString() !== currentUser._id.toString()) {
          matchedUserIds.add(userId.toString());
        }
      });
    });

    // ==========================================
    // ADD LIKE + MATCH STATUS
    // ==========================================

    const formattedUsers = users.map((user) => ({
      ...user,

      isLiked: likedUserIds.has(user._id.toString()),

      isMatched: matchedUserIds.has(user._id.toString()),
    }));

    // ==========================================
    // RESPONSE
    // ==========================================

    res.status(200).json({
      success: true,

      users: formattedUsers,

      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
      },
    });
  } catch (error) {
    next(error);
  }
};
