import api from "../utils/api.js";

/*
 * ==========================================
 * CREATE / GET CONVERSATION
 * ==========================================
 */

export const createOrGetConversation = async (matchId) => {
  const response = await api.post(
    `/messages/conversations/${matchId}`
  );

  return response.data;
};

/*
 * ==========================================
 * GET CONVERSATIONS
 * ==========================================
 */

export const getConversations = async () => {
  const response = await api.get(
    "/messages/conversations"
  );

  return response.data;
};

/*
 * ==========================================
 * GET MESSAGES
 * ==========================================
 */

export const getMessages = async (conversationId) => {
  const response = await api.get(
    `/messages/${conversationId}`
  );

  return response.data;
};

/*
 * ==========================================
 * SEND MESSAGE
 * ==========================================
 */

export const sendMessage = async (
  conversationId,
  text
) => {
  const response = await api.post(
    `/messages/${conversationId}`,
    {
      text,
    }
  );

  return response.data;
};

/*
 * ==========================================
 * MARK MESSAGE AS READ
 * ==========================================
 */

export const markMessageAsRead = async (
  messageId
) => {
  const response = await api.patch(
    `/messages/${messageId}/read`
  );

  return response.data;
};