// src/api/calls.ts
//
// Live calls are socket-based:
// call:start / call:accept / call:reject / call:signal / call:connected / call:end
//
// ICE servers arrive inside socket payloads:
// call:ready.iceServers
// call:ring.iceServers
//
// Do NOT use REST helpers for live signaling.
// The only confirmed REST call endpoint is call history, if mounted.

import { api } from "./client";

export interface CallHistoryPeer {
  _id: string;
  name?: string | null;
  photos?: Array<{
    url: string;
    isPrimary?: boolean;
  }> | null;
}

export interface CallHistoryItem {
  _id: string;
  peer: CallHistoryPeer | null;
  direction: "incoming" | "outgoing";
  mediaType: "audio" | "video";
  status: "missed" | "rejected" | "ended" | "failed";
  durationMs: number;
  endReason?: string | null;
  createdAt: string;
  connectedAt?: string | null;
}

export interface CallHistoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface CallHistoryResponse {
  success: boolean;
  calls: CallHistoryItem[];
  pagination?: CallHistoryPagination;
}

export async function getCallHistory(
  page = 1,
  limit = 20
): Promise<CallHistoryResponse> {
  const { data } = await api.get("/api/calls/history", {
    params: { page, limit },
  });
  return data;
}
