const KEY = "mm_device_id";

export const getDeviceId = () => {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
          .toString(36)
          .slice(2)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // localStorage blocked (private browsing, disabled, or full)
    // Return a session-scoped fallback that won't persist but won't crash
    return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};
