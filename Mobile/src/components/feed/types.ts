// src/components/feed/types.ts
// Shared feed contracts + the ONE asset require (depth-2 => 3 hops) + pure helpers.
// No React, no native modules => safe to import anywhere in the feed graph.
import { isSafeMediaUrl } from "../../utils/media";

// Single source for the fallback avatar so PostCard/CommentItem/FeedScreen never
// each re-require it at a possibly-wrong depth (the recurring asset bug).
export const DEFAULT_AVATAR = require("../../../assets/default-avatar.png");

// Server-authoritative caps (models): Comment.content maxlength 1000; web reply UX 500.
export const MAX_COMMENT_LEN = 1000;
export const MAX_REPLY_LEN = 500;
export const MAX_REPLY_DEPTH = 3; // web parity: prevent infinite nesting (DoS)

// EXACTLY the server enum (server/models/Comment.js ALLOWED_EMOJIS). Picking from this
// list guarantees a reaction can never 400 on enum validation => no spam/invalid-emoji vector.
export const ALLOWED_EMOJIS = [
  "❤️",
  "👍",
  "",
  "😂",
  "😮",
  "😢",
  "",
  "🎉",
  "",
  "🤔",
] as const;
export type ReactionEmoji = (typeof ALLOWED_EMOJIS)[number];

export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}
export interface FeedAuthor {
  _id?: string;
  name?: string;
  occupation?: string;
  photos?: Array<{ url?: string | null; isPrimary?: boolean }>;
}
export interface CommentNode {
  _id: string;
  author: FeedAuthor;
  content: string;
  createdAt: string;
  reactionSummary: Reaction[];
  repliesCount: number;
  isDeleted: boolean;
  isEdited: boolean;
  parent?: string | null;
  isMine?: boolean;
}
export interface NormalizedPost {
  _id: string;
  author: FeedAuthor;
  content: string;
  images: Array<string | { url?: string }>;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  isLiked: boolean;
  isSaved: boolean;
  isEdited: boolean;
  deletedForEveryone: boolean;
  comments: CommentNode[];
  createdAt: string;
}

// Coerce a raw image entry (string url OR {url}) to a displayable, ALLOW-GATED source.
// A malicious post author cannot make <Image> fetch an off-allowlist / cleartext host.
export function imageUrl(raw: unknown): { uri: string } | null {
  const u =
    typeof raw === "string"
      ? raw
      : raw && typeof (raw as any).url === "string"
      ? (raw as any).url
      : null;
  return isSafeMediaUrl(u) ? { uri: u as string } : null; // null => caller skips the image
}
// Prefer isPrimary photo, else first; gated; else bundled avatar (web CommentItem parity).
export function authorAvatar(
  author?: FeedAuthor | null
): { uri: string } | number {
  const photos = author?.photos;
  const pick = Array.isArray(photos)
    ? photos.find((p) => p?.isPrimary) || photos[0]
    : null;
  const u = pick?.url;
  return isSafeMediaUrl(u) ? { uri: u as string } : DEFAULT_AVATAR;
}

// Relative time (ported from web CommentItem.formatTime) — server sends ISO Date.
export function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Defense-in-depth on SEND: strip angle-bracket tags + zero-width/control chars, trim, cap.
// (RN <Text> won't execute tags, but this keeps stored content clean for any future webview/SEO
//  surface and blocks oversized payloads. Local so we don't import the empty utils/sanitize stub.)
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .slice(0, max);
}

// Normalize ONE raw comment (server shape) into CommentNode. Used for initial feed AND
// for replies fetched from the API, so a malformed comment can never null-deref a renderer.
export function normalizeComment(c: any): CommentNode | null {
  if (!c || typeof c !== "object") return null;
  const author =
    c.author && typeof c.author === "object"
      ? c.author
      : { name: "Deleted User" };
  return {
    _id:
      typeof c._id === "string" && c._id
        ? c._id
        : `tmp-${Math.random().toString(36).slice(2, 10)}`,
    author,
    content:
      typeof c.content === "string"
        ? c.content
        : typeof c.text === "string"
        ? c.text
        : "",
    createdAt:
      typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
    reactionSummary: Array.isArray(c.reactionSummary)
      ? c.reactionSummary.map((r: any) => ({
          emoji: String(r?.emoji ?? ""),
          count: Number(r?.count) || 0,
          reactedByMe: !!r?.reactedByMe,
        }))
      : [],
    repliesCount: Number.isFinite(c.repliesCount) ? c.repliesCount : 0,
    isDeleted: !!c.isDeleted,
    isEdited: !!c.isEdited,
    parent: typeof c.parent === "string" ? c.parent : null,
    isMine: !!c.isMine,
  };
}
