// src/components/discovery/index.ts
// Both leaves are now non-empty, so this barrel is safe (an empty stub here would throw
// TS1192 across every importer — the landmine this thread kills by ordering leaves-first).
export { default as ProfileCard } from "./ProfileCard";
export { default as MatchCard } from "./MatchCard";
