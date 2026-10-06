import api from "../utils/api.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|mp3|m4a|ogg|wav|webm)$/i;
const ALLOWED_TYPE =
  /^(image\/(jpeg|png|webp|gif)|audio\/(webm|mpeg|mp4|ogg|wav))$/i;

export const createOrGetConversation = async (matchId) =>
  (await api.post(`/messages/conversations/${matchId}`)).data;
export const getConversations = async () =>
  (await api.get("/messages/conversations")).data;
export const getRecentConversations = async () =>
  (await api.get("/messages/recent")).data;
export const deleteConversation = async (id) =>
  (await api.delete(`/messages/conversations/${id}`)).data;
export const getMessages = async (id, options = {}) =>
  (await api.get(`/messages/${id}`, { params: options })).data;
export const sendMessage = async (id, payload) =>
  (await api.post(`/messages/${id}`, payload)).data;
export const markMessageAsRead = async (id) =>
  (await api.patch(`/messages/${id}/read`)).data;
export const getUnreadMessageCount = async () =>
  (await api.get("/messages/unread-count")).data;
export const reactToMessage = async (id, emoji) =>
  (await api.post(`/messages/${id}/react`, { emoji })).data;
export const deleteMessage = async (id, scope = "me") =>
  (await api.delete(`/messages/${id}`, { params: { scope } })).data;

// Client-side pre-validation is UX + attack-surface reduction; the SERVER is the
// real gate (magic-bytes + URL allow-list + ownership). Never set Content-Type
// manually here — it destroys the multipart boundary and causes the 400s you saw.
export const uploadChatAttachment = async (file, conversationId = null) => {
  if (!file) throw new Error("No file provided");
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(
      `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`
    );
  if (file.type && !ALLOWED_TYPE.test(file.type))
    throw new Error("Unsupported file type");
  if (file.name && !ALLOWED_EXT.test(file.name))
    throw new Error("Unsupported file extension");

  const fd = new FormData();
  fd.append("file", file); // must match upload.single("file")
  if (conversationId) fd.append("conversationId", conversationId);

  try {
    return (await api.post("/messages/upload", fd, { timeout: 60000 })).data; // no headers → axios sets boundary
  } catch (error) {
    const msg =
      error?.response?.data?.message || error.message || "Upload failed";
    throw new Error(msg); // surface real reason; never log tokens/secrets
  }
};
