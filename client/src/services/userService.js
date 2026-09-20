import api from "../utils/api";

export const getMyProfile = async () => {
  const response = await api.get("/users/me");
  return response.data;
};

export const updateMyProfile = async (profileData) => {
  const response = await api.put("/users/me", profileData);
  return response.data;
};

export const getUserProfile = async (userId) => {
  const response = await api.get(`/users/${userId}`);
  return response.data;
};

export const uploadProfilePhoto = async (file) => {
  const formData = new FormData();

  formData.append("photo", file);

  const response = await api.post("/users/me/photos", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

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
  const response = await api.get("/discovery", {
    params: filters,
  });

  return response.data;
};

export const getUserById = async (userId) => {
  const response = await api.get(`/users/${userId}`);
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

export const getBlockStatus = async (userId) => {
  const response = await api.get(`/users/${userId}/block-status`);
  return response.data;
};

export const getBlockedUsers = async (search = "") => {
  const res = await api.get(`/users/blocked?search=${encodeURIComponent(search)}`);
  return res.data;
};

export const unblockUser = async (userId) => {
  const res = await api.post(`/users/${userId}/block`); // match your existing unblock route
  return res.data;
};

export const searchBlockableUsers = async (q) => {
  const res = await api.get(`/users/search/blockable?q=${encodeURIComponent(q)}`);
  return res.data;
};