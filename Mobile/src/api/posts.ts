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

// web getFeed(page,limit) => parity; backend already accepts limit.
export async function fetchFeedPosts(
  page = 1,
  limit = 20
): Promise<{ posts: FeedPost[]; total: number }> {
  const { data } = await api.get("/api/posts", { params: { page, limit } });
  return data;
}

// SETTLED by #4 (no longer "unproven"): web CreatePost appends field "content" (string) +
// field "images" (FILES) into a FormData and posts multipart; the server route is
// upload.array(...) (upload.middleware.js:436). So mobile MUST send the SAME multipart shape —
// JSON here was a latent 415/500 (multer skips non-multipart => req.files undefined). Field
// names "content"/"images" are READ off web, not guessed. NO explicit Content-Type: this
// mirrors web createPost ("let axios auto-detect boundary") AND the working mobile chat upload
// (uploadChatAttachment posts FormData via the same `api` instance with no header and the real
// 0:07 clips prove mobile axios auto-sets the multipart boundary). Setting application/json
// would make multer skip => the exact bug we're fixing.
export interface PostFilePart {
  uri: string;
  name?: string;
  type?: string;
}
export async function createFeedPost(
  content: string,
  files: PostFilePart[] = []
) {
  const fd = new FormData();
  fd.append("content", (content || "").trim());
  for (const f of files) {
    // RN file-part shape {uri,name,type}; `as any` satisfies lib-DOM FormData typing without
    // changing the wire bytes (the chat upload uses the identical part shape and works).
    fd.append("images", {
      uri: f.uri,
      name: f.name || `image-${Date.now()}.jpg`,
      type: f.type || "image/jpeg",
    } as any);
  }
  const { data } = await api.post("/api/posts", fd); // no headers => multipart boundary auto
  return data;
}

export async function togglePostLike(postId: string) {
  const { data } = await api.post(`/api/posts/${postId}/like`);
  return data;
}

// FIX (was { text } => empty comment / 400 against the Comment model's `content` field).
// Mirrors web addComment(postId, content) => { content }. Param renamed text->content; callers
// pass positionally so FeedScreen's addPostComment(pid, text) is unaffected.
export async function addPostComment(postId: string, content: string) {
  const { data } = await api.post(`/api/posts/${postId}/comments`, { content });
  return data;
}

export async function togglePostSave(postId: string) {
  const { data } = await api.post(`/api/posts/${postId}/save`);
  return data;
}

// NEW — shapes read verbatim off web postService (#1), not guessed.
export async function getShareTargets(): Promise<any> {
  const { data } = await api.get("/api/posts/share-targets");
  return data;
}
export async function sharePost(postId: string, userIds: string[]) {
  const { data } = await api.post(`/api/posts/${postId}/share`, { userIds });
  return data;
}
