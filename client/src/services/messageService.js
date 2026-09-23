import api from "../utils/api.js";

export const createOrGetConversation = async (matchId) => {
  const response = await api.post(`/messages/conversations/${matchId}`);
  return response.data;
};

/** @returns {Promise<{ conversations: Array }>} */
export const getConversations = async () => {
  const response = await api.get("/messages/conversations");
  return response.data;
};

/** @returns {Promise<{ conversations: Array }>} */
export const getRecentConversations = async () => {
  const response = await api.get("/messages/recent");
  return response.data;
};

export const deleteConversation = async (conversationId) => {
  const response = await api.delete(
    `/messages/conversations/${conversationId}`
  );
  return response.data;
};

export const getMessages = async (conversationId) => {
  const response = await api.get(`/messages/${conversationId}`);
  return response.data;
};

export const sendMessage = async (conversationId, payload) => {
  const response = await api.post(`/messages/${conversationId}`, payload);
  return response.data;
};

export const markMessageAsRead = async (messageId) => {
  const response = await api.patch(`/messages/${messageId}/read`);
  return response.data;
};

export const getUnreadMessageCount = async () => {
  const response = await api.get("/messages/unread-count");
  return response.data;
};

export const reactToMessage = async (messageId, emoji) => {
  const response = await api.post(`/messages/${messageId}/react`, { emoji });
  return response.data;
};

export const deleteMessage = async (messageId, scope) => {
  // ✅ Use axios params instead of manual query string
  const response = await api.delete(`/messages/${messageId}`, {
    params: { scope },
  });
  return response.data;
};

export const uploadChatAttachment = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  // ✅ Let axios auto-detect Content-Type with correct boundary
  const response = await api.post("/messages/upload", formData);
  return response.data;
};
