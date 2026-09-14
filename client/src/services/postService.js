import api from "../utils/api.js";

export const postService = {
  createPost: async (formData) => {
    const { data } = await api.post("/posts", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  getFeed: async (page = 1, limit = 20) => {
    const { data } = await api.get(`/posts?page=${page}&limit=${limit}`);
    return data;
  },

  getMyPosts: async (page = 1, limit = 20) => {
    const { data } = await api.get(`/posts/my?page=${page}&limit=${limit}`);
    return data;
  },

  getSavedPosts: async (page = 1, limit = 20) => {
    const { data } = await api.get(`/posts/saved?page=${page}&limit=${limit}`);
    return data;
  },

  getPost: async (id) => {
    const { data } = await api.get(`/posts/${id}`);
    return data;
  },

  editPost: async (id, content) => {
    const { data } = await api.put(`/posts/${id}`, { content });
    return data;
  },

  deletePost: async (id) => {
    const { data } = await api.delete(`/posts/${id}`);
    return data;
  },

  toggleLike: async (id) => {
    const { data } = await api.post(`/posts/${id}/like`);
    return data;
  },

  toggleSave: async (id) => {
    const { data } = await api.post(`/posts/${id}/save`);
    return data;
  },

  getComments: async (postId, page = 1) => {
    const { data } = await api.get(`/posts/${postId}/comments?page=${page}`);
    return data;
  },

  addComment: async (postId, content) => {
    const { data } = await api.post(`/posts/${postId}/comments`, { content });
    return data;
  },

  deleteComment: async (postId, commentId) => {
    const { data } = await api.delete(`/posts/${postId}/comments/${commentId}`);
    return data;
  },

  // 👇 NEW — now inside the object
  getReplies: async (postId, commentId) => {
    const { data } = await api.get(
      `/posts/${postId}/comments/${commentId}/replies`
    );
    return data;
  },

  addReply: async (postId, commentId, content) => {
    const { data } = await api.post(
      `/posts/${postId}/comments/${commentId}/replies`,
      { content }
    );
    return data;
  },

  toggleReaction: async (commentId, emoji) => {
    const { data } = await api.post(`/posts/comments/${commentId}/reactions`, {
      emoji,
    });
    return data;
  },

  getShareTargets: async () => {
    const { data } = await api.get("/posts/share-targets");
    return data;
  },

  sharePost: async (postId, userIds) => {
    const { data } = await api.post(`/posts/${postId}/share`, { userIds });
    return data;
  },
};
