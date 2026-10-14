// src/api/posts.ts
import { api } from "./client";

export interface FeedPost {
  _id: string;
  author: {
    _id: string;
    name: string;
    photos?: Array<{ url: string; isPrimary?: boolean }>;
    occupation?: string;
  };
  content: string;
  images?: string[];
  likes: string[];
  comments: Array<{
    _id: string;
    user: { _id: string; name: string; photos?: Array<{ url: string }> };
    text: string;
    createdAt: string;
  }>;
  isLiked?: boolean;
  isSaved?: boolean;
  createdAt: string;
}

export async function fetchFeedPosts(page = 1): Promise<{ posts: FeedPost[]; total: number }> {
  const { data } = await api.get("/api/posts", { params: { page } });
  return data;
}

export async function createFeedPost(content: string, imageUrls: string[] = []) {
  const { data } = await api.post("/api/posts", {
    content,
    images: imageUrls,
  });
  return data;
}

export async function togglePostLike(postId: string) {
  const { data } = await api.post(`/api/posts/${postId}/like`);
  return data;
}

export async function addPostComment(postId: string, text: string) {
  const { data } = await api.post(`/api/posts/${postId}/comments`, { text });
  return data;
}

export async function togglePostSave(postId: string) {
  const { data } = await api.post(`/api/posts/${postId}/save`);
  return data;
}
