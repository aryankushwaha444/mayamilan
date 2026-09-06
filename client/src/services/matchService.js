import api from "../utils/api.js";

export const likeUser = async (userId) => {
  const response = await api.post(`/likes/${userId}`);
  return response.data;
};

export const unlikeUser = async (userId) => {
  const response = await api.delete(`/likes/${userId}`);
  return response.data;
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
