// src/api/matches.ts
import { api } from "./client";
import { CandidateUser } from "./discovery";

export interface MatchRecord {
  _id: string;
  user: CandidateUser;
  matchedAt: string;
  conversationId?: string;
  lastMessage?: {
    text: string;
    type: string;
    createdAt: string;
    isMine: boolean;
    isRead: boolean;
  } | null;
  unreadCount?: number;
}

// ✅ NEW: This matches the EXACT structure from your backend log
export interface ReceivedLikeRecord {
  _id: string;
  from: CandidateUser; // The user who liked you is inside 'from'
  to: string;
  type: string;
  isHidden: boolean;
  resultedInMatch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchesResponse {
  success: boolean;
  matches: MatchRecord[];
  count: number;
  pagination: any;
}

export interface LikesResponse {
  success: boolean;
  likes: ReceivedLikeRecord[]; // ✅ Array of Like records, not Users
  count: number;
  pagination: any;
}

export async function fetchMatches(): Promise<MatchesResponse> {
  const { data } = await api.get<MatchesResponse>("/api/matches");
  return data;
}

export async function fetchLikesReceived(): Promise<LikesResponse> {
  const { data } = await api.get<LikesResponse>("/api/likes/received");
  return data;
}

export async function deleteMatch(matchId: string) {
  const encodedId = encodeURIComponent(matchId);
  const { data } = await api.delete(`/api/matches/${encodedId}`);
  return data;
}
