// src/utils/videoQuality.ts — clamp constraints so a malicious remote SDP/offer can't
// request absurd resolution/bitrate (resource-exhaustion / battery DoS).
export interface VideoConstraints {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
}
const TIERS: Record<string, VideoConstraints> = {
  low: { width: 480, height: 360, frameRate: 15, maxBitrate: 300_000 },
  medium: { width: 640, height: 480, frameRate: 24, maxBitrate: 700_000 },
  high: { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_500_000 },
};
export function pickVideoConstraints(
  tier: string,
  devicePixelRatio = 2
): VideoConstraints {
  const t = TIERS[tier] ?? TIERS.medium;
  const cap = 1920; // hard ceiling regardless of tier
  return {
    ...t,
    width: Math.min(t.width, cap),
    height: Math.min(t.height, cap),
    frameRate: Math.min(t.frameRate, 30),
    maxBitrate: Math.min(t.maxBitrate, 2_000_000),
    ...(devicePixelRatio > 3 ? { width: Math.min(t.width, 720) } : {}),
  };
}
