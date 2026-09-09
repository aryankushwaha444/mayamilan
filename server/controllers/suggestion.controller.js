import Suggestion from "../models/Suggestion.js";

export const submitSuggestion = async (req, res, next) => {
  try {
    const { name, email, category, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const suggestion = await Suggestion.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      category: category || "general",
      subject: subject.trim(),
      message: message.trim(),
      user: req.user?._id || null,
    });

    res.status(201).json({
      success: true,
      message: "Suggestion submitted successfully",
      suggestion,
    });
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   ADMIN: GET ALL SUGGESTIONS (with filters + stats)
========================================== */
export const getSuggestions = async (req, res, next) => {
  try {
    const { status, category, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (category && category !== "all") filter.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [suggestions, total, newCount, reviewedCount, resolvedCount] =
      await Promise.all([
        Suggestion.find(filter)
          .populate("user", "name email photos")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Suggestion.countDocuments(filter),
        Suggestion.countDocuments({ status: "new" }),
        Suggestion.countDocuments({ status: "reviewed" }),
        Suggestion.countDocuments({ status: "resolved" }),
      ]);

    res.status(200).json({
      success: true,
      suggestions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
      stats: {
        total: total,
        new: newCount,
        reviewed: reviewedCount,
        resolved: resolvedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   ADMIN: UPDATE STATUS (new / reviewed / resolved)
========================================== */
export const updateSuggestionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ["new", "reviewed", "resolved"];

    if (!valid.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const suggestion = await Suggestion.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        message: "Suggestion not found",
      });
    }

    res.status(200).json({ success: true, suggestion });
  } catch (error) {
    next(error);
  }
};

/* ==========================================
   ADMIN: DELETE SUGGESTION
========================================== */
export const deleteSuggestion = async (req, res, next) => {
  try {
    const suggestion = await Suggestion.findByIdAndDelete(req.params.id);

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        message: "Suggestion not found",
      });
    }

    res.status(200).json({ success: true, message: "Suggestion deleted" });
  } catch (error) {
    next(error);
  }
};
