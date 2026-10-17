// src/types/match.ts
import type { UserPhoto, UserLocation, Gender, RelationshipGoal } from "./user";
export interface MatchProfile {
  _id: string;
  name: string;
  photos?: UserPhoto[];
  location?: UserLocation;
  age?: number;
  gender?: Gender;
  relationshipGoal?: RelationshipGoal;
  bio?: string;
  occupation?: string;
  education?: string;
  isVerified?: boolean;
  isOnline?: boolean;
  matchScore?: number;
}
export interface MatchResult {
  matched: boolean;
  conversationId?: string;
  matchId?: string;
}
export interface Suggestion {
  profile: MatchProfile;
  reason?: string;
  score?: number;
}
