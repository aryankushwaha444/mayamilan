import Call from "../models/Call.js";

const PER_PAGE_MAX = 50;

export const getCallHistory = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      PER_PAGE_MAX
    );
    const skip = (page - 1) * limit;
    const uid = req.user._id;

    const filter = { $or: [{ caller: uid }, { callee: uid }] };
    const [calls, total] = await Promise.all([
      Call.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("caller", "name photos")
        .populate("callee", "name photos")
        .lean(),
      Call.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      calls: calls.map((c) => {
        const isOutgoing = String(c.caller?._id) === String(uid);
        const peer = isOutgoing ? c.callee : c.caller;
        return {
          _id: c._id,
          peer: peer
            ? {
                _id: peer._id,
                name: peer.name,
                photos: (peer.photos || []).map((p) => ({
                  url: p.url,
                  isPrimary: !!p.isPrimary,
                })),
              }
            : null,
          direction: isOutgoing ? "outgoing" : "incoming",
          mediaType: c.mediaType,
          status: c.status,
          durationMs: c.durationMs,
          endReason: c.endReason,
          createdAt: c.createdAt,
          connectedAt: c.connectedAt,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (error) {
    next(error);
  }
};
