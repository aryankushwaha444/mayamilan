// src/components/feed/index.ts
export { default as PostCard } from "./PostCard";
export { default as CommentItem } from "./CommentItem";
export { default as ShareModal } from "./ShareModal"; // non-empty now => safe (was omitted while empty)
export * from "./types";
// CreatePostForm is imported DIRECTLY by CreatePostScreen (not via this barrel), so no line here.
