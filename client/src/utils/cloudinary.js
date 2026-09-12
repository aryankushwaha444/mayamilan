/**
 * Adds Cloudinary transformations to raw upload URLs.
 *
 * BEFORE: https://res.cloudinary.com/xxx/image/upload/v123/abc.jpg        (4 MB original)
 * AFTER:  https://res.cloudinary.com/xxx/image/upload/w_600,h_600,c_fill,
 *         q_auto,f_auto,g_face/v123/abc.jpg                                (~80 KB)
 *
 * Non-Cloudinary URLs (local files, GIFs, defaults) are returned untouched.
 */
export function optimize(
  url,
  { w, h, c = "fill", g = "auto", q = "auto", f = "auto" } = {}
) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url; // not Cloudinary → skip
  if (/\/upload\/(w_|[^/]*,w_)/.test(url)) return url; // already transformed → skip

  const transforms = [
    `w_${w}`,
    `h_${h}`,
    `c_${c}`,
    `g_${g}`,
    `q_${q}`,
    `f_${f}`,
  ].join(",");
  return url.replace("/upload/", `/upload/${transforms}/`);
}

/* READY-MADE PRESETS */

// Small avatars (40–100px): navbar, comments, chat lists, notifications
export const avatarImg = (url) =>
  optimize(url, { w: 100, h: 100, c: "fill", g: "face" });

// Cards & grids (300–600px): match cards, discover cards, profile grids
export const cardImg = (url) =>
  optimize(url, { w: 600, h: 600, c: "fill", g: "face" });

// Feed / chat images (fit inside, no cropping)
export const postImg = (url) => optimize(url, { w: 1000, h: 1000, c: "limit" });

// Lightbox / full-screen view
export const fullImg = (url) => optimize(url, { w: 1600, h: 1600, c: "limit" });
