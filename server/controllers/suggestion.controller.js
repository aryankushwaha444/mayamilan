import mongoose from "mongoose";
import Suggestion from "../models/Suggestion.js";
import { sanitize } from "../utils/sanitize.js";
import { logAudit } from "../utils/auditLogger.js";
// import { sendSuggestionResponseEmail } from "../config/email.js"; // Uncomment when email template is ready

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const VALID_CATEGORIES = [
  "general",
  "bug",
  "feature",
  "improvement",
  "security",
  "other",
];

// ✅ FIX: Added "planned" to match the schema enum
const VALID_STATUSES = ["new", "reviewed", "planned", "resolved", "rejected"];

const MAX_NAME_LENGTH = 100;
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_ADMIN_NOTES_LENGTH = 2000; // ✅ Aligned with schema
const SUGGESTIONS_PER_PAGE = 20;
const MAX_LIMIT = 100;

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

const isValidEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

const checkHoneypot = async (req, action) => {
  if (req.body.website && req.body.website.trim() !== "") {
    await logAudit(req, "honeypot_triggered", {
      action,
      ip: req.ip,
      reason: "field_filled",
    });
    return true;
  }

  const formLoadTime = req.headers["x-form-load-time"];
  if (formLoadTime) {
    const timeSpent = Date.now() - parseInt(formLoadTime, 10);
    if (timeSpent < 2000) {
      await logAudit(req, "honeypot_triggered", {
        action,
        ip: req.ip,
        reason: "too_fast",
        timeSpent,
      });
      return true;
    }
  }

  return false;
};

// ═══════════════════════════════════════════
// SUBMIT SUGGESTION (Public)
// ═══════════════════════════════════════════

export const submitSuggestion = async (req, res, next) => {
  try {
    if (await checkHoneypot(req, "submit_suggestion")) {
      return res
        .status(200)
        .json({ success: true, message: "Suggestion submitted successfully" });
    }

    const { name, email, category, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (!isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email address" });
    }

    const cleanName = sanitize(name.trim());
    const cleanEmail = email.trim().toLowerCase();
    const cleanSubject = sanitize(subject.trim());
    const cleanMessage = sanitize(message.trim());
    const cleanCategory = VALID_CATEGORIES.includes(category)
      ? category
      : "general";

    if (cleanName.length === 0 || cleanName.length > MAX_NAME_LENGTH) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Name must be between 1 and ${MAX_NAME_LENGTH} characters`,
        });
    }
    if (cleanSubject.length === 0 || cleanSubject.length > MAX_SUBJECT_LENGTH) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Subject must be between 1 and ${MAX_SUBJECT_LENGTH} characters`,
        });
    }
    if (cleanMessage.length === 0 || cleanMessage.length > MAX_MESSAGE_LENGTH) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters`,
        });
    }

    const suggestion = await Suggestion.create({
      name: cleanName,
      email: cleanEmail,
      category: cleanCategory,
      subject: cleanSubject,
      message: cleanMessage,
      user: req.user?._id || null,
      status: "new",
      // ✅ FIX: Capture IP and User-Agent for spam tracking
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    await logAudit(req, "suggestion_submitted", {
      suggestionId: suggestion._id,
      email: cleanEmail,
      category: cleanCategory,
      userId: req.user?._id || null,
    });

    res.status(201).json({
      success: true,
      message: "Suggestion submitted successfully. We'll review it soon!",
      suggestion: {
        _id: suggestion._id,
        status: suggestion.status,
        createdAt: suggestion.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET ALL SUGGESTIONS (Admin with Text Search)
// ═══════════════════════════════════════════

export const getSuggestions = async (req, res, next) => {
  try {
    const {
      status,
      category,
      search,
      priority,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = SUGGESTIONS_PER_PAGE,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(
      Math.max(parseInt(limit, 10) || SUGGESTIONS_PER_PAGE, 1),
      MAX_LIMIT
    );
    const skip = (pageNumber - 1) * limitNumber;

    const filter = {};

    if (status && status !== "all" && VALID_STATUSES.includes(status))
      filter.status = status;
    if (category && category !== "all" && VALID_CATEGORIES.includes(category))
      filter.category = category;
    if (priority && ["low", "medium", "high", "urgent"].includes(priority))
      filter.priority = priority;

    // ✅ FIX: Use MongoDB native $text search instead of slow $regex
    let useTextSearch = false;
    if (search && search.trim()) {
      filter.$text = { $search: search.trim() };
      useTextSearch = true;
    }

    // Sort options
    const validSortFields = ["createdAt", "status", "priority", "category"];
    let sortOptions = {};

    if (useTextSearch) {
      // Sort by text relevance score when searching
      sortOptions = { score: { $meta: "textScore" } };
    } else {
      const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
      const sortDirection = sortOrder === "asc" ? 1 : -1;
      sortOptions = { [sortField]: sortDirection, createdAt: -1 };
    }

    const query = Suggestion.find(filter)
      .populate("user", "name email photos")
      .populate("reviewedBy", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);

    // Add text score projection if searching
    if (useTextSearch) {
      query.select({ score: { $meta: "textScore" } });
    }

    const [suggestions, total, stats] = await Promise.all([
      query.lean(),
      Suggestion.countDocuments(filter),
      Suggestion.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const statsMap = {
      total,
      new: 0,
      reviewed: 0,
      planned: 0,
      resolved: 0,
      rejected: 0,
    };
    stats.forEach((s) => {
      if (s._id && Object.hasOwn(statsMap, s._id)) statsMap[s._id] = s.count;
    });

    res.status(200).json({
      success: true,
      suggestions,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages: Math.ceil(total / limitNumber),
        hasNextPage: pageNumber * limitNumber < total,
      },
      stats: statsMap,
      filters: {
        status: status || "all",
        category: category || "all",
        priority: priority || null,
        search: search || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET SINGLE SUGGESTION (Admin)
// ═══════════════════════════════════════════

export const getSuggestionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid suggestion ID" });
    }

    const suggestion = await Suggestion.findById(id)
      .populate("user", "name email photos")
      .populate("reviewedBy", "name email")
      .lean();

    if (!suggestion)
      return res
        .status(404)
        .json({ success: false, message: "Suggestion not found" });

    res.status(200).json({ success: true, suggestion });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// UPDATE SUGGESTION STATUS (Admin)
// ═══════════════════════════════════════════

export const updateSuggestionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, adminNotes } = req.body; // ✅ FIX: Changed from adminResponse

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid suggestion ID" });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid status. Must be one of: ${VALID_STATUSES.join(
            ", "
          )}`,
        });
    }

    const validPriorities = ["low", "medium", "high", "urgent"];
    if (priority && !validPriorities.includes(priority)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid priority. Must be one of: ${validPriorities.join(
            ", "
          )}`,
        });
    }

    if (adminNotes && adminNotes.length > MAX_ADMIN_NOTES_LENGTH) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Admin notes cannot exceed ${MAX_ADMIN_NOTES_LENGTH} characters`,
        });
    }

    const suggestion = await Suggestion.findById(id);
    if (!suggestion)
      return res
        .status(404)
        .json({ success: false, message: "Suggestion not found" });

    const oldStatus = suggestion.status;

    if (status) {
      suggestion.status = status;
      suggestion.reviewedBy = req.user._id;
      suggestion.reviewedAt = new Date();
    }

    if (priority) suggestion.priority = priority;

    if (adminNotes !== undefined) {
      suggestion.adminNotes = adminNotes ? sanitize(adminNotes) : "";
    }

    await suggestion.save();

    // ✅ FIX: Send email notification to user if status changed to resolved/rejected and notes were provided
    if (
      status &&
      status !== oldStatus &&
      (status === "resolved" || status === "rejected") &&
      suggestion.adminNotes
    ) {
      try {
        // Uncomment when your email template is ready
        // await sendSuggestionResponseEmail(suggestion.email, {
        //   name: suggestion.name,
        //   subject: suggestion.subject,
        //   status,
        //   adminNotes: suggestion.adminNotes,
        // });
      } catch (emailError) {
        console.error(
          "Failed to send suggestion response email:",
          emailError.message
        );
      }
    }

    const populated = await Suggestion.findById(id)
      .populate("user", "name email photos")
      .populate("reviewedBy", "name email")
      .lean();

    await logAudit(req, "suggestion_updated", {
      suggestionId: id,
      status,
      priority,
      adminNotes: adminNotes ? "provided" : "cleared",
    });

    res
      .status(200)
      .json({
        success: true,
        message: "Suggestion updated successfully",
        suggestion: populated,
      });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// DELETE SUGGESTION (Admin)
// ═══════════════════════════════════════════

export const deleteSuggestion = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid suggestion ID" });
    }

    const suggestion = await Suggestion.findByIdAndDelete(id);
    if (!suggestion)
      return res
        .status(404)
        .json({ success: false, message: "Suggestion not found" });

    await logAudit(req, "suggestion_deleted", {
      suggestionId: id,
      email: suggestion.email,
      subject: suggestion.subject,
      ip: suggestion.ip, // Log IP for spam tracking
    });

    res
      .status(200)
      .json({ success: true, message: "Suggestion deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// BULK UPDATE STATUS (Admin)
// ═══════════════════════════════════════════

export const bulkUpdateStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "Provide an array of suggestion IDs",
        });
    if (ids.length > 50)
      return res
        .status(400)
        .json({
          success: false,
          message: "Cannot update more than 50 suggestions at once",
        });
    if (!VALID_STATUSES.includes(status))
      return res
        .status(400)
        .json({
          success: false,
          message: `Invalid status. Must be one of: ${VALID_STATUSES.join(
            ", "
          )}`,
        });

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length)
      return res
        .status(400)
        .json({ success: false, message: "Some suggestion IDs are invalid" });

    const result = await Suggestion.updateMany(
      { _id: { $in: validIds } },
      { $set: { status, reviewedBy: req.user._id, reviewedAt: new Date() } }
    );

    await logAudit(req, "suggestions_bulk_updated", {
      count: result.modifiedCount,
      status,
    });

    res
      .status(200)
      .json({
        success: true,
        message: `${result.modifiedCount} suggestions updated`,
        modifiedCount: result.modifiedCount,
      });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// BULK DELETE (Admin)
// ═══════════════════════════════════════════

export const bulkDeleteSuggestions = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "Provide an array of suggestion IDs",
        });
    if (ids.length > 50)
      return res
        .status(400)
        .json({
          success: false,
          message: "Cannot delete more than 50 suggestions at once",
        });

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length)
      return res
        .status(400)
        .json({ success: false, message: "Some suggestion IDs are invalid" });

    const result = await Suggestion.deleteMany({ _id: { $in: validIds } });

    await logAudit(req, "suggestions_bulk_deleted", {
      count: result.deletedCount,
    });

    res
      .status(200)
      .json({
        success: true,
        message: `${result.deletedCount} suggestions deleted`,
        deletedCount: result.deletedCount,
      });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════
// GET SUGGESTION STATS (Admin Dashboard)
// ═══════════════════════════════════════════

export const getSuggestionStats = async (req, res, next) => {
  try {
    const [total, byStatus, byCategory, byPriority, recentCount] =
      await Promise.all([
        Suggestion.countDocuments(),
        Suggestion.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Suggestion.aggregate([
          { $group: { _id: "$category", count: { $sum: 1 } } },
        ]),
        Suggestion.aggregate([
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
        Suggestion.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
      ]);

    const formatStats = (stats) => {
      const map = {};
      stats.forEach((s) => {
        if (s._id) map[s._id] = s.count;
      });
      return map;
    };

    res.status(200).json({
      success: true,
      stats: {
        total,
        recentWeek: recentCount,
        byStatus: formatStats(byStatus),
        byCategory: formatStats(byCategory),
        byPriority: formatStats(byPriority),
      },
    });
  } catch (error) {
    next(error);
  }
};
