import api from "../utils/api.js";

export const likeUser = async (userId) => {
  try {
    const response = await api.post(`/likes/${userId}`);
    return response.data;
  } catch (error) {
    // ✅ Removed the "🚨 BACKEND CRASHED" debug logging: a 400 "already liked" /
    // 403 blocked / 429 limit are NORMAL business responses, not crashes. Logging
    // them as crashes was misleading. The throw contract is unchanged so existing
    // try/catch callers (Matches/Profile) still behave identically.
    throw error;
  }
};

export const unlikeUser = async (userId) => {
  const response = await api.delete(`/likes/${userId}`);
  return response.data;
};

/**
 * ✅ NEW: single toggle primitive for the Discover heart. Routes by the caller's
 * current liked-state and NEVER dead-ends on a duplicate like: the server's
 * `400 { alreadyLiked:true }` (see like.controller.js) is treated as SUCCESS for
 * "make liked", returning the authoritative state so the card renders a FILLED
 * heart and the NEXT click unlikes. Real errors (403 blocked, 429 limit, 5xx)
 * still throw so the caller can toast them. This is what turns the heart into a
 * true toggle and kills the "already liked" dead-end + the optimistic-rollback
 * that left the heart unfilled while a Like row existed.
 *
 * NOTE: this fixes the CLICK path. Correct FIRST-PAINT (heart already filled on
 * load for a previously-liked person) still needs the discovery feed to carry
 * `isLiked` (discovery.controller.js) or the card to prefetch sent-likes — see
 * Part C. Until that lands, the heart initializes unfilled and self-heals to
 * filled on the first click via the alreadyLiked branch below.
 */
export const toggleLike = async (userId, isLiked) => {
  if (isLiked) {
    const response = await api.delete(`/likes/${userId}`);
    return { success: true, liked: false, ...(response.data || {}) };
  }
  try {
    const response = await api.post(`/likes/${userId}`);
    return { success: true, liked: true, ...(response.data || {}) };
  } catch (error) {
    // Already liked on the server -> that IS the desired end-state for "like".
    if (error.response?.status === 400 && error.response?.data?.alreadyLiked) {
      return { success: true, liked: true, alreadyLiked: true };
    }
    throw error; // blocked / rate-limited / server error -> surface to the caller
  }
};

export const getSentLikes = async () => {
  const response = await api.get("/likes/sent");
  return response.data;
};

export const getReceivedLikes = async () => {
  const response = await api.get("/likes/received");
  return response.data;
};

export const getMatches = async () => {
  const response = await api.get("/matches");
  return response.data;
};

export const getMatchById = async (matchId) => {
  const response = await api.get(`/matches/${matchId}`);
  return response.data;
};

export const deleteMatch = async (matchId) => {
  const response = await api.delete(`/matches/${matchId}`);
  return response.data;
};
