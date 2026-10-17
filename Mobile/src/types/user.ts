// src/types/user.ts — unions MUST match api/auth's inline enums structurally (they do)
export type Gender =
  | "male"
  | "female"
  | "non-binary"
  | "other"
  | "prefer-not-to-say";
export type RelationshipGoal =
  | "serious"
  | "marriage"
  | "casual"
  | "friendship"
  | "not-sure";
export type MaritalStatus =
  | "never-married"
  | "divorced"
  | "widowed"
  | "awaiting-divorce";
export interface UserPhoto {
  _id?: string;
  url: string;
  isPrimary?: boolean;
  publicId?: string;
}
export interface UserLocation {
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
}
// Single source of truth: AuthUser lives in api/auth; re-export, never redefine.
export type { AuthUser } from "../api/auth";
