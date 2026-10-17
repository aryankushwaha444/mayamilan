// src/types/post.ts
export interface PostAttachment {
  url: string;
  type: "image" | "video" | "gif";
  publicId?: string;
  width?: number;
  height?: number;
}
export interface PostAuthor {
  _id: string;
  name: string;
  photos?: { url: string }[];
  isVerified?: boolean;
}
export interface PostComment {
  _id: string;
  author: PostAuthor;
  text: string;
  createdAt: string;
  deleted?: boolean;
}
export interface Post {
  _id: string;
  author: PostAuthor;
  text?: string;
  media?: PostAttachment[];
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  isLiked?: boolean;
  isSaved?: boolean;
  createdAt: string;
  deletedFor?: string[];
}
