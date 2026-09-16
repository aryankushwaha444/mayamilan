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
    return "unknown-device";
  }
};
