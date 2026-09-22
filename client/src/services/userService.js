import api from "../utils/api";

/**
 * Get current user's profile
 * @returns {Promise<{user: Object}>}
 */
export const getMyProfile = async () => {
  const response = await api.get("/users/me");
  return response.data;
};

/**
 * Update current user's profile
 * @param {Object} profileData - Profile fields to update
 * @returns {Promise<{user: Object}>}
 */
export const updateMyProfile = async (profileData) => {
  const response = await api.put("/users/me", profileData);
  return response.data;
};

/**
 * Get user profile by ID
 * @param {string} userId - User ID
 * @returns {Promise<{user: Object}>}
 */
export const getUserById = async (userId) => {
  const response = await api.get(`/users/${userId}`);
  return response.data;
};

/**
 * Upload profile photo
 * @param {File} file - Image file
 * @returns {Promise<{photos: Array}>}
 */
export const uploadProfilePhoto = async (file) => {
  const formData = new FormData();
  formData.append("photo", file);

  // ✅ Axios auto-detects Content-Type for FormData, no need to set manually
  const response = await api.post("/users/me/photos", formData);
  return response.data;
};

/**
 * Delete profile photo
 * @param {string} photoId - Photo ID to delete
 * @returns {Promise<{photos: Array}>}
 */
export const deleteProfilePhoto = async (photoId) => {
  const response = await api.delete(`/users/me/photos/${photoId}`);
  return response.data;
};

/**
 * Set photo as primary
 * @param {string} photoId - Photo ID to set as primary
 * @returns {Promise<{photos: Array}>}
 */
export const setPrimaryPhoto = async (photoId) => {
  const response = await api.put(`/users/me/photos/${photoId}/primary`);
  return response.data;
};

/**
 * Discover users with filters
 * @param {Object} filters - Discovery filters (age, gender, distance, etc.)
 * @returns {Promise<{users: Array, pagination: Object}>}
 */
export const discoverUsers = async (filters = {}) => {
  const response = await api.get("/discovery", { params: filters });
  return response.data;
};

/**
 * Report a user
 * @param {string} userId - User ID to report
 * @param {string} message - Report reason/message
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const reportUser = async (userId, message) => {
  const response = await api.post(`/users/${userId}/report`, { message });
  return response.data;
};

/**
 * Toggle block status for a user
 * @param {string} userId - User ID to block/unblock
 * @returns {Promise<{blocked: boolean, message: string}>}
 */
export const toggleBlockUser = async (userId) => {
  const response = await api.post(`/users/${userId}/block`);
  return response.data;
};

/**
 * Get block status for a user
 * @param {string} userId - User ID to check
 * @returns {Promise<{isBlocked: boolean}>}
 */
export const getBlockStatus = async (userId) => {
  const response = await api.get(`/users/${userId}/block-status`);
  return response.data;
};

/**
 * Get list of blocked users
 * @param {string} search - Optional search query
 * @returns {Promise<{users: Array}>}
 */
export const getBlockedUsers = async (search = "") => {
  // ✅ Use params instead of manual URL encoding
  const response = await api.get("/users/blocked", {
    params: { search },
  });
  return response.data;
};

/**
 * Unblock a user (alias for toggleBlockUser)
 * @param {string} userId - User ID to unblock
 * @returns {Promise<{blocked: boolean, message: string}>}
 */
export const unblockUser = async (userId) => {
  // ✅ Clarified: This calls the same toggle endpoint
  const response = await api.post(`/users/${userId}/block`);
  return response.data;
};

/**
 * Search for users that can be blocked
 * @param {string} query - Search query
 * @returns {Promise<{users: Array}>}
 */
export const searchBlockableUsers = async (query) => {
  // ✅ Use params instead of manual URL encoding
  const response = await api.get("/users/search/blockable", {
    params: { q: query },
  });
  return response.data;
};

// ✅ Removed duplicate: getUserProfile (same as getUserById)
