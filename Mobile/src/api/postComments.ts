// src/api/postComments.ts
// The 4 comment sub-endpoints the web CommentItem uses. I cannot SEE client/src/services/
// postService.js (GitHub = login wall), so these use the conventional REST pattern that
// matches your existing /api/posts/:id/like + /api/posts/:id/comments. CONFIRM the 4 strings
// against your LOCAL web file in 5 seconds:
//   grep -nE "reaction|repl|deleteComment|/comments/" client/src/services/postService.js
// A wrong path degrades to a CAUGHT error toast (never a crash, never silent bad data).
import { api } from "./client";
import { isObjectId } from "../utils/media";
import type { CommentNode, Reaction } from "../components/feed/types";

const enc = encodeURIComponent;
const ok = (id: unknown) => isObjectId(id);

export async function toggleReaction(
  commentId: string,
  emoji: string
): Promise<{ reactionSummary: Reaction[] }> {
  if (!ok(commentId)) throw new Error("bad comment id");
  const { data } = await api.post(
    `/api/posts/comments/${enc(commentId)}/reactions`,
    { emoji }
  );
  const d = data?.data ?? data;
  return {
    reactionSummary: Array.isArray(d?.reactionSummary) ? d.reactionSummary : [],
  };
}

export async function getReplies(
  postId: string,
  commentId: string
): Promise<{ replies: CommentNode[] }> {
  if (!ok(postId) || !ok(commentId)) throw new Error("bad id");
  const { data } = await api.get(
    `/api/posts/${enc(postId)}/comments/${enc(commentId)}/replies`
  );
  const d = data?.data ?? data;
  const list = Array.isArray(d?.replies)
    ? d.replies
    : Array.isArray(d)
    ? d
    : [];
  return { replies: list };
}

export async function addReply(
  postId: string,
  commentId: string,
  content: string
): Promise<{ reply: CommentNode; repliesCount: number }> {
  if (!ok(postId) || !ok(commentId)) throw new Error("bad id");
  // server field is `content` (model), NOT `text` — the old mobile code got this wrong.
  const { data } = await api.post(
    `/api/posts/${enc(postId)}/comments/${enc(commentId)}/replies`,
    { content }
  );
  const d = data?.data ?? data;
  return { reply: d?.reply ?? d, repliesCount: Number(d?.repliesCount) || 0 };
}

export async function deleteComment(
  postId: string,
  commentId: string
): Promise<void> {
  if (!ok(postId) || !ok(commentId)) throw new Error("bad id");
  await api.delete(`/api/posts/${enc(postId)}/comments/${enc(commentId)}`);
}
