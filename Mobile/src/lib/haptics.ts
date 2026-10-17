// src/lib/haptics.ts — expo-haptics is NOT installed => lazy require + no-op fallback.
// A stale/missing native build degrades to silence, never a red screen (ExponentAV lesson).
let H: any = null;
try {
  H = require("expo-haptics");
} catch {
  H = null;
}

const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* no-op */
  }
};

export const impactLight = () =>
  safe(() => H?.impactAsync?.(H?.ImpactStyle?.Light));
export const impactMedium = () =>
  safe(() => H?.impactAsync?.(H?.ImpactStyle?.Medium));
export const impactHeavy = () =>
  safe(() => H?.impactAsync?.(H?.ImpactStyle?.Heavy));
export const selectionChanged = () => safe(() => H?.selectionAsync?.());
export const notifySuccess = () =>
  safe(() => H?.notificationAsync?.(H?.NotificationType?.Success));
export const notifyWarning = () =>
  safe(() => H?.notificationAsync?.(H?.NotificationType?.Warning));
export const notifyError = () =>
  safe(() => H?.notificationAsync?.(H?.NotificationType?.Error));

export const haptics = {
  impactLight,
  impactMedium,
  impactHeavy,
  selectionChanged,
  notifySuccess,
  notifyWarning,
  notifyError,
};
export default haptics;
