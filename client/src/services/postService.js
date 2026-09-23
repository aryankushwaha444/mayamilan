import api from "../utils/api.js";

const createPost = async (formData) => {
  // ✅ Let axios auto-detect Content-Type with correct multipart boundary
  const { data } = await api.post("/posts", formData);
  return data;
};

const getFeed = async (page = 1, limit = 20) => {
  const { data } = await api.get("/posts", { params: { page, limit } });
  return data;
};

const getMyPosts = async (page = 1, limit = 20) => {
  const { data } = await api.get("/posts/my", { params: { page, limit } });
  return data;
};

const getSavedPosts = async (page = 1, limit = 20) => {
  const { data } = await api.get("/posts/saved", { params: { page, limit } });
  return data;
};

const getPost = async (id) => {
  const { data } = await api.get(`/posts/${id}`);
  return data;
};

const editPost = async (id, content) => {
  const { data } = await api.put(`/posts/${id}`, { content });
  return data;
};

const deletePost = async (id) => {
  const { data } = await api.delete(`/posts/${id}`);
  return data;
};

const toggleLike = async (id) => {
  const { data } = await api.post(`/posts/${id}/like`);
  return data;
};

const toggleSave = async (id) => {
  const { data } = await api.post(`/posts/${id}/save`);
  return data;
};

const getComments = async (postId, page = 1) => {
  const { data } = await api.get(`/posts/${postId}/comments`, {
    params: { page },
  });
  return data;
};

const addComment = async (postId, content) => {
  const { data } = await api.post(`/posts/${postId}/comments`, { content });
  return data;
};

const deleteComment = async (postId, commentId) => {
  const { data } = await api.delete(`/posts/${postId}/comments/${commentId}`);
  return data;
};

const getReplies = async (postId, commentId) => {
  const { data } = await api.get(
    `/posts/${postId}/comments/${commentId}/replies`
  );
  return data;
};

const addReply = async (postId, commentId, content) => {
  const { data } = await api.post(
    `/posts/${postId}/comments/${commentId}/replies`,
    { content }
  );
  return data;
};

const toggleReaction = async (commentId, emoji) => {
  const { data } = await api.post(`/posts/comments/${commentId}/reactions`, {
    emoji,
  });
  return data;
};

const getShareTargets = async () => {
  const { data } = await api.get("/posts/share-targets");
  return data;
};

const sharePost = async (postId, userIds) => {
  const { data } = await api.post(`/posts/${postId}/share`, { userIds });
  return data;
};

export const postService = {
  createPost,
  getFeed,
  getMyPosts,
  getSavedPosts,
  getPost,
  editPost,
  deletePost,
  toggleLike,
  toggleSave,
  getComments,
  addComment,
  deleteComment,
  getReplies,
  addReply,
  toggleReaction,
  getShareTargets,
  sharePost,
};
