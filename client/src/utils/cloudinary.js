export function optimize(
  url,
  { w, h, c = "limit", q = "auto", f = "auto", g = null } = {}
) {
  // Guard against invalid input
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;

  // ✅ Comprehensive check for already-transformed URLs
  // Matches: /upload/w_*, /upload/c_*, /upload/v1234/w_*, /upload/f_auto,q_auto,*
  if (/\/upload\/(?:v\d+\/)?(?:[^/]*,)?[whcfg]_/.test(url)) return url;

  // ✅ Only include defined numeric dimensions
  const transforms = [];
  if (typeof w === "number" && w > 0) transforms.push(`w_${w}`);
  if (typeof h === "number" && h > 0) transforms.push(`h_${h}`);
  transforms.push(`c_${c}`, `q_${q}`, `f_${f}`);

  // Gravity only valid with crop modes
  if (g && (c === "fill" || c === "thumb" || c === "crop")) {
    transforms.push(`g_${g}`);
  }

  return url.replace("/upload/", `/upload/${transforms.join(",")}/`);
}

export const avatarImg = (url) =>
  optimize(url, { w: 100, h: 100, c: "fill", g: "face" });

export const cardImg = (url) =>
  optimize(url, { w: 600, h: 600, c: "fill", g: "face" });

export const postImg = (url) => optimize(url, { w: 1000, h: 1000, c: "limit" });

export const fullImg = (url) => optimize(url, { w: 1600, h: 1600, c: "limit" });
