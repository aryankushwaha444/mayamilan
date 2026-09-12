/**
 * Cloudinary URL optimizer.
 * NOTE: gravity (g_) is ONLY valid with cropping modes (fill/thumb).
 * Never combine g_* with c_limit / c_fit / c_scale → Cloudinary returns 400.
 */
export function optimize(
  url,
  { w, h, c = "limit", q = "auto", f = "auto", g = null } = {}
) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  if (/\/upload\/(w_|[^/]*,w_)/.test(url)) return url; // already transformed

  const t = [`w_${w}`, `h_${h}`, `c_${c}`, `q_${q}`, `f_${f}`];
  if (g && (c === "fill" || c === "thumb")) t.push(`g_${g}`); // gravity ONLY for crop modes

  return url.replace("/upload/", `/upload/${t.join(",")}/`);
}

/* ============ PRESETS ============ */

// Small avatars (crop + face detection = valid)
export const avatarImg = (url) =>
  optimize(url, { w: 100, h: 100, c: "fill", g: "face" });

// Cards & grids (crop + face detection = valid)
export const cardImg = (url) =>
  optimize(url, { w: 600, h: 600, c: "fill", g: "face" });

// Feed / chat images (fit inside, NO gravity)
export const postImg = (url) => optimize(url, { w: 1000, h: 1000, c: "limit" });

// Lightbox full view (fit inside, NO gravity)
export const fullImg = (url) => optimize(url, { w: 1600, h: 1600, c: "limit" });
