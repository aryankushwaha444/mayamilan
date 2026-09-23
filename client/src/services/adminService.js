import api from "../utils/api";

export const getAdminStats = async () => {
  const response = await api.get("/admin/stats");
  return response.data;
};

export const getUsers = async (params = {}) => {
  const response = await api.get("/admin/users", { params });
  return response.data;
};

export const getUserById = async (userId) => {
  const response = await api.get(`/admin/users/${userId}`);
  return response.data;
};

export const updateUser = async (userId, data) => {
  const response = await api.put(`/admin/users/${userId}`, data);
  return response.data;
};

export const toggleUserStatus = async (userId) => {
  const response = await api.patch(`/admin/users/${userId}/toggle-status`);
  return response.data;
};

export const deleteUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};

export const deleteUserPhoto = async (userId, photoId) => {
  const response = await api.delete(`/admin/users/${userId}/photos/${photoId}`);
  return response.data;
};

export const getUserReports = async (userId) => {
  const response = await api.get(`/admin/users/${userId}/reports`);
  return response.data;
};

export const updateReportStatus = async (reportId, status) => {
  const response = await api.patch(`/admin/reports/${reportId}`, { status });
  return response.data;
};

export const getAllReports = async (params = {}) => {
  const response = await api.get("/admin/reports", { params });
  return response.data;
};

export const getSuggestions = async (filters = {}) => {
  // ✅ FIXED: Use axios params instead of manual URLSearchParams
  const response = await api.get("/admin/suggestions", { params: filters });
  return response.data;
};

export const updateSuggestionStatus = async (id, status) => {
  const response = await api.patch(`/admin/suggestions/${id}`, { status });
  return response.data;
};

export const deleteSuggestion = async (id) => {
  const response = await api.delete(`/admin/suggestions/${id}`);
  return response.data;
};
