// src/components/call/index.ts
// Presentational call tiles only. The signaling state machine (useCall/CallContext) lives in
// hooks/ + context/ (NOT this folder) and is still empty pending the last web read, so it is
// DELIBERATELY not re-exported here -> an empty re-export is the TS1192 landmine this thread
// kills by ordering leaves-before-barrel and barrel-after-everything-it-references.
export { default as LocalVideoTile } from "./LocalVideoTile";
export { default as RemoteVideoTile } from "./RemoteVideoTile";
export { default as InCallOverlay } from "./InCallOverlay";
