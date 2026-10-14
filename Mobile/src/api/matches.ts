// src/api/matches.ts
import { api } from "./client";
import { CandidateUser } from "./discovery";

export interface MatchRecord {
  _id: string;
  user: CandidateUser;
  matchedAt: string;
  conversationId?: string;
  lastMessage?: string;
}

export async function fetchMatches(): Promise<{ matches: MatchRecord[] }> {
  const { data } = await api.get("/api/matches");
  return data;
}

export async function fetchLikesReceived(): Promise<{ likes: CandidateUser[] }> {
  const { data } = await api.get("/api/likes/received");
  return data;
}

export async function deleteMatch(matchId: string) {
  const { data } = await api.delete(`/api/matches/${matchId}`);
  return data;
}
