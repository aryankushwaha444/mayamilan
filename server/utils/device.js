import crypto from "crypto";

// Use a dedicated secret (falls back to refresh secret if not set)
const DEVICE_SECRET =
  process.env.DEVICE_BINDING_SECRET ||
  process.env.JWT_REFRESH_SECRET ||
  "fallback-secret";

/**
Read device ID from request header, validate it
 */
export const getDeviceId = (req) => {
  const id = req.headers["x-device-id"];
  if (typeof id !== "string") return null;
  if (id.length < 8 || id.length > 128) return null;
  return id;
};

export const deviceFingerprint = (deviceId) => {
  return crypto
    .createHmac("sha256", DEVICE_SECRET)
    .update(String(deviceId))
    .digest("hex");
};

/**
Human-readable device label for the "Active Sessions" UI
 */
export const describeDevice = (req) => {
  const ua = req.get("user-agent") || "";

  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Brave/.test(ua)) browser = "Brave";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
};
