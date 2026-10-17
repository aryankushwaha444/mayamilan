// src/api/suggestions.ts
import { api } from "./client";
import { isObjectId } from "../utils/media";
import type { Suggestion } from "../types/match";
export async function getSuggestions(page = 1) {
  const { data } = await api.get("/api/suggestions", { params: { page } });
  return data as { suggestions: Suggestion[]; hasMore: boolean };
}
export async function skipSuggestion(profileId: string) {
  if (!isObjectId(profileId)) throw new Error("bad id");
  const { data } = await api.post("/api/suggestions/skip", { profileId });
  return data;
}
export async function getDailyMatches() {
  const { data } = await api.get("/api/suggestions/daily");
  return data;
}
