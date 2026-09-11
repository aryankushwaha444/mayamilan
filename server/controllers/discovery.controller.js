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

    // BLOCKED USERS (both directions)
    const me = await User.findById(currentUser._id).select("blockedUsers");
    const iBlockedIds = (me?.blockedUsers || []).map((id) => id.toString());

    const blockedMe = await User.find({ blockedUsers: currentUser._id })
      .select("_id")
      .lean();
    const blockedMeIds = blockedMe.map((u) => u._id.toString());

    // 👇 MATCHES ONLY — per your requirement: ONLY matched users are hidden
    const matches = await Match.find({ users: currentUser._id })
      .select("users")
      .lean();

    const matchedUserIds = new Set();
    matches.forEach((match) => {
      match.users.forEach((id) => {
        if (id.toString() !== currentUser._id.toString()) {
          matchedUserIds.add(id.toString());
        }
      });
    });

    // 👇 Sent likes: NOT excluded anymore — only used to mark cards as "Liked"
    const sentLikes = await Like.find({ from: currentUser._id })
      .select("to")
      .lean();
    const likedUserIds = new Set(sentLikes.map((l) => l.to.toString()));

    // 👇 EXCLUDE ONLY: self + matched + blocked (NO likes!)
    const excludeUserIds = Array.from(
      new Set([
        currentUser._id.toString(),
        ...matchedUserIds,
        ...iBlockedIds,
        ...blockedMeIds,
      ])
    );

    // BUILD QUERY
    const query = {
      _id: { $nin: excludeUserIds },
      isActive: true,
    };

    if (gender) query.gender = gender;

    if (city) {
      query["location.city"] = { $regex: city, $options: "i" };
    }

    if (relationshipGoal) query.relationshipGoal = relationshipGoal;

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

    if (interests) {
      const interestList = interests
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);

      if (interestList.length > 0) {
        query.interests = { $in: interestList };
      }
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select(
          "name dateOfBirth gender bio photos location occupation education interests relationshipGoal isVerified isOnline lastSeen"
        )
        .sort({ isOnline: -1, lastSeen: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      User.countDocuments(query),
    ]);

    // 👇 Mark liked users so frontend can show "Liked ✓" state
    const formattedUsers = users.map((user) => ({
      ...user,
      isLiked: likedUserIds.has(user._id.toString()),
      isMatched: false,
    }));

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
