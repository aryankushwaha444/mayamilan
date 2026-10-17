// src/utils/cloudinary.ts — build transformed URLs ONLY from a validated Cloudinary source.
// Never pass a full attacker-supplied remote URL through a transform proxy (SSRF/image-abuse guard).
import { isSafeMediaUrl } from "./media";
export function cldTransform(
  url: unknown,
  opts: { width?: number; quality?: number; format?: "auto" | "webp" } = {}
): string | null {
  if (!isSafeMediaUrl(url)) return null;
  const u = url as string;
  if (!/cloudinary\.com/i.test(new URL(u).hostname)) return u; // only transform our own CDN
  const w = Math.min(Math.max(opts.width ?? 0, 0), 2000);
  const q = Math.min(Math.max(opts.quality ?? 80, 1), 100);
  const fmt = opts.format ?? "auto";
  const inject = `w_${w},q_${q},f_${fmt}`;
  return u.includes("/upload/")
    ? u.replace("/upload/", `/upload/${inject}/`)
    : u;
}
