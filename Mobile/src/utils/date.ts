// src/utils/date.ts — pure formatters (no markup built; RN Text is the only sink)
export const formatTime = (d: string): string => {
  try {
    return new Date(d).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};
export const formatDateSeparator = (d: string): string => {
  try {
    const date = new Date(d),
      today = new Date(),
      y = new Date(today);
    y.setDate(y.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === y.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Unknown Date";
  }
};
export const formatDuration = (sec?: number): string => {
  const n = Math.max(0, Math.floor(Number(sec) || 0)),
    m = Math.floor(n / 60),
    s = n % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
