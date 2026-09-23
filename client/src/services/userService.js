import api from "../utils/api";

export const getMyProfile = async () => {
  const response = await api.get("/users/me");
  return response.data;
};

export const updateMyProfile = async (profileData) => {
  const response = await api.put("/users/me", profileData);
  return response.data;
};

export const getUserById = async (userId) => {
  const response = await api.get(`/users/${userId}`);
  return response.data;
};

export const uploadProfilePhoto = async (file) => {
  const formData = new FormData();
  formData.append("photo", file);
  // Axios auto-detects Content-Type for FormData with correct boundary
  const response = await api.post("/users/me/photos", formData);
  return response.data;
};

export const deleteProfilePhoto = async (photoId) => {
  const response = await api.delete(`/users/me/photos/${photoId}`);
  return response.data;
};

export const setPrimaryPhoto = async (photoId) => {
  const response = await api.put(`/users/me/photos/${photoId}/primary`);
  return response.data;
};

export const discoverUsers = async (filters = {}) => {
  const response = await api.get("/discovery", { params: filters });
  return response.data;
};

export const reportUser = async (userId, message) => {
  const response = await api.post(`/users/${userId}/report`, { message });
  return response.data;
};

export const toggleBlockUser = async (userId) => {
  const response = await api.post(`/users/${userId}/block`);
  return response.data;
};

export const unblockUser = async (userId) => {
  const response = await api.post(`/users/${userId}/block`);
  return response.data;
};

export const getBlockStatus = async (userId) => {
  const response = await api.get(`/users/${userId}/block-status`);
  return response.data;
};

export const getBlockedUsers = async (search = "") => {
  const response = await api.get("/users/blocked", { params: { search } });
  return response.data;
};

export const searchBlockableUsers = async (query) => {
  const response = await api.get("/users/search/blockable", {
    params: { q: query },
  });
  return response.data;
};
