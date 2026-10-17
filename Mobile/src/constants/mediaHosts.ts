// Host allowlist. unsplash INTENTIONALLY EXCLUDED: the knowledge base proved
// images.unsplash.com can resolve to a third-party casino PWA (BRZ7.GAMES).
export const MEDIA_HOSTS: RegExp[] = [
  /(^|\.)cloudinary\.com$/i, // your Cloudinary (res.*.cloudinary.com)
  /(^|\.)giphy\.com$/i, // GIFs
  /(^|\.)tenor\.com$/i,
  /(^|\.)tenor\.googleusercontent\.com$/i,
  /(^|\.)mayamilan\.onrender\.com$/i, // your deployed backend (own-host assets)
];
export const OBJECTID_RE = /^[a-f\d]{24}$/i;
