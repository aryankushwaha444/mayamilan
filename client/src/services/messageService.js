import api from "../utils/api.js";

//  CREATE / GET CONVERSATION
export const createOrGetConversation = async (matchId) => {
  const response = await api.post(`/messages/conversations/${matchId}`);

  return response.data;
};

//  GET CONVERSATIONS
export const getConversations = async () => {
  const response = await api.get("/messages/conversations");

  return response.data;
};

//  GET MESSAGES
export const getMessages = async (conversationId) => {
  const response = await api.get(`/messages/${conversationId}`);

  return response.data;
};

//  SEND MESSAGE
export const sendMessage = async (conversationId, text) => {
  const response = await api.post(`/messages/${conversationId}`, {
    text,
  });

  return response.data;
};

//  MARK MESSAGE AS READ
export const markMessageAsRead = async (messageId) => {
  const response = await api.patch(`/messages/${messageId}/read`);

  return response.data;
};

export const getUnreadMessageCount = async () => {
  const response = await api.get("/messages/unread-count");
  return response.data;
};

export const getRecentConversations = async () => {
  const response = await api.get("/messages/recent");
  return response.data;
};

export const uploadChatAttachment = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/messages/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const sendChatMessage = async (conversationId, payload) => {
  // use the SAME url pattern as your existing sendMessage route
  const response = await api.post(`/messages/${conversationId}`, payload);
  return response.data;
};

export const reactToMessage = async (messageId, emoji) => {
  const response = await api.post(`/messages/${messageId}/react`, { emoji });
  return response.data;
};

export const deleteMessage = async (messageId, scope) => {
  const response = await api.delete(`/messages/${messageId}?scope=${scope}`);
  return response.data;
};
