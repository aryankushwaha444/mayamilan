// src/api/discovery.ts
import { api } from "./client";

export interface CandidateUser {
  _id: string;
  name: string;
  email?: string;
  dateOfBirth?: string;
  gender: string;
  bio?: string;
  occupation?: string;
  education?: string;
  relationshipGoal?: string;
  photos: Array<{ url: string; isPrimary?: boolean; publicId?: string }>;
  interests?: string[];
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  isVerified?: boolean;
  rashi?: string;
  gotra?: string;
  caste?: string;
  religion?: string;
  height?: string;
  diet?: string;
  maritalStatus?: string;
  familyType?: string;
  matchScore?: number;
  isLiked?: boolean;
  isMatched?: boolean;
}

export interface DiscoveryQuery {
  minAge?: number | string;
  maxAge?: number | string;
  gender?: string;
  city?: string;
  relationshipGoal?: string;
  interests?: string;
  page?: number;
  limit?: number;
}

export async function getDiscoveryCandidates(params?: DiscoveryQuery) {
  const { data } = await api.get("/api/discovery", { params });
  return data;
}

export async function likeCandidate(userId: string) {
  // ✅ SECURITY: encodeURIComponent prevents path traversal attacks
  const { data } = await api.post(`/api/likes/${encodeURIComponent(userId)}`);
  return data;
}

export async function unlikeCandidate(userId: string) {
  const { data } = await api.delete(`/api/likes/${encodeURIComponent(userId)}`);
  return data;
}
