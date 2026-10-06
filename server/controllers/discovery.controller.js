import User from "../models/User.js";
import Like from "../models/Like.js";
import Match from "../models/Match.js";
import { logAudit } from "../utils/auditLogger.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_AGE = 18;
const MAX_AGE = 100;
const ACTIVE_WITHIN_DAYS = 30;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const safeLogAudit = async (req, action, metadata) => {
  try {
    await logAudit(req, action, metadata);
  } catch {
    // Silent failure
  }
};

const getCoords = (location) => location?.coordinates?.coordinates;

const hasValidCoordinates = (location) => {
  const c = getCoords(location);
  return Array.isArray(c) && c.length === 2 && !(c[0] === 0 && c[1] === 0);
};

const calculateAgeRange = (minAge, maxAge) => {
  const today = new Date();
  const oldestDate = new Date(today);
  oldestDate.setFullYear(today.getFullYear() - Number(maxAge) - 1);
  oldestDate.setDate(today.getDate() + 1);
  const youngestDate = new Date(today);
  youngestDate.setFullYear(today.getFullYear() - Number(minAge));
  return { $gte: oldestDate, $lte: youngestDate };
};

const sanitizePagination = (page, limit) => {
  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const limitNumber = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  return { pageNumber, limitNumber, skip: (pageNumber - 1) * limitNumber };
};

const validateAgeRange = (minAge, maxAge) => {
  const min = minAge ? Number(minAge) : MIN_AGE;
  const max = maxAge ? Number(maxAge) : MAX_AGE;
  if (min < MIN_AGE || max > MAX_AGE || min > max)
    return { valid: false, min: MIN_AGE, max: MAX_AGE };
  return { valid: true, min, max };
};

// ═══════════════════════════════════════════
// MAIN DISCOVERY FUNCTION
// ═══════════════════════════════════════════

export const discoverUsers = async (req, res, next) => {
  try {
    const currentUser = req.user;
    const { page = 1, limit = DEFAULT_LIMIT, sortBy = "activity" } = req.query;
    const { pageNumber, limitNumber, skip } = sanitizePagination(page, limit);

    const [me, blockedMeDocs, matches, sentLikes] = await Promise.all([
      User.findById(currentUser._id)
        .select("blockedUsers location preferences")
        .lean(),
      User.find({ blockedUsers: currentUser._id }).select("_id").lean(),
      Match.find({ users: currentUser._id, isActive: true })
        .select("users")
        .lean(),
      Like.find({ from: currentUser._id }).select("to").lean(),
    ]);

    const iBlockedIds = (me?.blockedUsers || []).map((id) => id.toString());
    const blockedMeIds = blockedMeDocs.map((u) => u._id.toString());

    const matchedUserIds = new Set();
    matches.forEach((m) =>
      m.users.forEach((id) => {
        if (id.toString() !== currentUser._id.toString())
          matchedUserIds.add(id.toString());
      })
    );

    const likedUserIds = sentLikes.map((l) => l.to.toString());

    const excludeUserIds = Array.from(
      new Set([
        currentUser._id.toString(),
        ...matchedUserIds,
        ...iBlockedIds,
        ...blockedMeIds,
        // ✅ REMOVED: likedUserIds - Allow seeing already-liked users
      ])
    );

    const prefs = me?.preferences || {};
    const minAge = req.query.minAge || prefs.minAge || MIN_AGE;
    const maxAge = req.query.maxAge || prefs.maxAge || MAX_AGE;
    const gender =
      req.query.gender ||
      (prefs.preferredGender && prefs.preferredGender !== "all"
        ? prefs.preferredGender
        : null);
    const maxDistanceKm = prefs.maxDistance || 50;

    const query = {
      _id: { $nin: excludeUserIds },
      isActive: true,
      deletedAt: null,
      $or: [
        {
          lastSeen: {
            $gte: new Date(
              Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000
            ),
          },
        },
        { lastSeen: null },
      ],
    };

    // ✅ Only require valid coordinates if current user has valid location
    if (hasValidCoordinates(me?.location)) {
      query["location.coordinates.coordinates"] = { $ne: [0, 0] };
    }

    if (gender && ["male", "female", "non-binary", "other"].includes(gender)) {
      query.gender = gender;
    }

    // ✅ FIXED: Sanitize city input to prevent ReDoS
    if (req.query.city && req.query.city.trim()) {
      const safeCity = req.query.city
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query["location.city"] = { $regex: safeCity, $options: "i" };
    }

    if (req.query.relationshipGoal) {
      query.relationshipGoal = req.query.relationshipGoal;
    }

    const ageValidation = validateAgeRange(minAge, maxAge);
    // Allow users with no birthday to show up, OR match the age range
    query.$or = [
      ...(query.$or || []),
      { dateOfBirth: null },
      { dateOfBirth: calculateAgeRange(ageValidation.min, ageValidation.max) },
    ];
    // Remove the strict dateOfBirth requirement if it was added at the root level
    delete query.dateOfBirth;

    if (req.query.interests) {
      const interestList = req.query.interests
        .split(",")
        .map((i) => i.trim().toLowerCase())
        .filter(Boolean);
      if (interestList.length > 0) query.interests = { $in: interestList };
    }

    let sortOrder = {};
    const useDistanceSort =
      sortBy === "distance" && hasValidCoordinates(me?.location);

    if (useDistanceSort) {
      query["location.coordinates"] = {
        $near: {
          $geometry: { type: "Point", coordinates: getCoords(me.location) },
          $maxDistance: maxDistanceKm * 1000,
        },
      };
      sortOrder = { isOnline: -1 };
    } else {
      sortOrder = { isOnline: -1, lastSeen: -1, createdAt: -1 };
    }

    // 🐛 DEBUG: Log the exact query being executed
    console.log("🔍 Discovery Query:", JSON.stringify(query, null, 2));
    console.log("🚫 Excluded User IDs:", excludeUserIds);
    console.log("👤 Current User ID:", currentUser._id.toString());

    const [users, total] = await Promise.all([
      User.find(query)
        .select(
          "name dateOfBirth gender bio photos location occupation education interests relationshipGoal isVerified isOnline lastSeen"
        )
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      User.countDocuments(
        useDistanceSort
          ? { ...query, "location.coordinates": undefined }
          : query
      ),
    ]);

    const myCoords = getCoords(me?.location);

    const formattedUsers = users.map((user) => ({
      ...user,
      isLiked: false,
      isMatched: false,
      isProfileComplete: !!(
        user.photos?.length > 0 &&
        user.dateOfBirth &&
        user.gender
      ),
      age: user.dateOfBirth
        ? Math.floor(
            (new Date() - new Date(user.dateOfBirth)) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null,
      distanceKm:
        hasValidCoordinates(user.location) && myCoords
          ? Math.round(calculateDistance(myCoords, getCoords(user.location)))
          : null,
    }));

    // ✅ ADDED: Audit logging for discovery queries
    await safeLogAudit(req, "discovery_feed_viewed", {
      resultsCount: formattedUsers.length,
      filters: {
        gender: gender || null,
        minAge: ageValidation.min,
        maxAge: ageValidation.max,
        city: req.query.city || null,
      },
      page: pageNumber,
    });

    // ✅ DISABLE CACHING - Force fresh discovery results every time
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });

    res.status(200).json({
      success: true,
      users: formattedUsers,
      filters: {
        ageRange: ageValidation,
        appliedFilters: {
          gender: gender || null,
          city: req.query.city || null,
          relationshipGoal: req.query.relationshipGoal || null,
          interests: req.query.interests
            ? req.query.interests.split(",").map((i) => i.trim())
            : [],
        },
      },
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

function calculateDistance(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
