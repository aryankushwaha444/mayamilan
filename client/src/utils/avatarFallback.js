export const DEFAULT_AVATAR = `${import.meta.env.BASE_URL}images/default-avatar.png`;

export function onAvatarError(e) {
  const el = e.currentTarget;
  if (el.dataset.avatarFallbackApplied === "1") return; // already degraded once
  el.dataset.avatarFallbackApplied = "1";
  el.src = DEFAULT_AVATAR;
  el.style.objectFit = "contain";
  el.style.background = "#f1f5f9";
  if (!el.alt) el.alt = "Profile photo unavailable";
  el.onerror = null;
}