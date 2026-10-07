import crypto from "crypto";

// ✅ #1 FAIL CLOSED: a hardcoded fallback secret would let an attacker compute valid
// device fingerprints for ANY device id (full device-binding bypass) the moment the
// env is misconfigured. There is no safe default -> refuse to boot without a real secret.
// JWT_REFRESH_SECRET_CURRENT is an acceptable source (validated >=64 in generateToken),
// but DEVICE_BINDING_SECRET is preferred so device binding isn't coupled to refresh.
const DEVICE_SECRET =
  process.env.DEVICE_BINDING_SECRET || process.env.JWT_REFRESH_SECRET_CURRENT;
if (!DEVICE_SECRET || DEVICE_SECRET.length < 32) {
  throw new Error(
    "DEVICE_BINDING_SECRET (or JWT_REFRESH_SECRET_CURRENT) must be set to a strong value (>=32 chars). " +
      "Device binding cannot run with a fallback secret. Generate with:\n" +
      "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}
const MAX_UA_LENGTH = 500;
const MAX_CARRIED_LEN = 2048; // ✅ defence-in-depth cap before decodeURIComponent/JSON.parse

const validId = (v) =>
  typeof v === "string" &&
  v.length >= 8 &&
  v.length <= 128 &&
  /^[a-zA-Z0-9_-]+$/.test(v);

/** Stable per-browser id: header (XHR) -> cookie (rides OAuth navigation). */
export const getDeviceId = (req) => {
  if (!req) return null;
  const h = req.headers?.["x-device-id"];
  if (validId(h)) return h;
  const c = req.cookies?.mm_device_id;
  if (validId(c)) return c;
  return null;
};

export const deviceFingerprint = (deviceId) => {
  if (!deviceId) return null;
  return crypto
    .createHmac("sha256", DEVICE_SECRET)
    .update(String(deviceId))
    .digest("hex");
};

// keep the legacy string helper for audit telemetry only
export const describeDevice = (req) => {
  let ua = "";
  if (req)
    ua =
      (typeof req.get === "function"
        ? req.get("user-agent")
        : req.headers?.["user-agent"]) || "";
  ua = String(ua).substring(0, MAX_UA_LENGTH);
  if (!ua) return "Unknown Device";
  if (/bot|crawl|spider|curl|wget|python|postman|httpclient/i.test(ua))
    return "Bot / Automated Script";
  const d = parseUaString(ua);
  return `${d.browser} on ${d.os}`;
};

export const generateDeviceSignature = (req) => {
  const components = [
    getDeviceId(req) || "no-device-id",
    req?.get?.("user-agent") || "unknown",
    req?.get?.("accept-language") || "unknown",
  ];
  return crypto
    .createHash("sha256")
    .update(components.join("|"))
    .digest("hex")
    .substring(0, 16);
};

// ── sanitizers (client-supplied data is UNTRUSTED) ──────────────
const cleanStr = (v, max) =>
  typeof v === "string"
    ? v
        .replace(/[^\x20-\x7E]/g, "")
        .trim()
        .slice(0, max)
    : "";
const cleanEnum = (v, allowed, fallback) =>
  allowed.includes(v) ? v : fallback;
const DT = ["desktop", "mobile", "tablet", "unknown"];

const parseUaString = (ua) => {
  const l = String(ua || "").toLowerCase();
  const ver = (re) => {
    const m = ua.match(re);
    return m ? m[1] : "";
  };
  let browser = "Unknown",
    browserVersion = "";
  if (/edg\//.test(l)) {
    browser = "Edge";
    browserVersion = ver(/Edg\/([\d.]+)/);
  } else if (/opr\/|opera/.test(l)) {
    browser = "Opera";
    browserVersion = ver(/OPR\/([\d.]+)/) || ver(/Opera\/([\d.]+)/);
  } else if (/vivaldi/.test(l)) {
    browser = "Vivaldi";
    browserVersion = ver(/Vivaldi\/([\d.]+)/);
  } else if (/brave/.test(l)) {
    browser = "Brave";
    browserVersion = ver(/Brave\/([\d.]+)/);
  } else if (/firefox\/|fxios\//.test(l)) {
    browser = "Firefox";
    browserVersion = ver(/Firefox\/([\d.]+)/) || ver(/FxIOS\/([\d.]+)/);
  } else if (/chrome\/|crios\//.test(l)) {
    browser = "Chrome";
    browserVersion = ver(/Chrome\/([\d.]+)/) || ver(/CriOS\/([\d.]+)/);
  } else if (/safari/.test(l)) {
    browser = "Safari";
    browserVersion = ver(/Version\/([\d.]+)/);
  }

  let os = "Unknown",
    osVersion = "";
  if (/windows nt 10\.0/.test(l)) {
    os = "Windows";
    osVersion = "10";
  } else if (/windows/.test(l)) os = "Windows";
  else if (/mac os x|macintosh/.test(l)) {
    os = "macOS";
    const m = ua.match(/Mac OS X ([\d_]+)/);
    if (m) osVersion = m[1].replace(/_/g, ".");
  } else if (/android/.test(l)) {
    os = "Android";
    const m = ua.match(/Android ([\d.]+)/);
    if (m) osVersion = m[1];
  } else if (/ipad/.test(l)) {
    os = "iPadOS";
    const m = ua.match(/OS ([\d_]+)/);
    if (m) osVersion = m[1].replace(/_/g, ".");
  } else if (/iphone|ipod/.test(l)) {
    os = "iOS";
    const m = ua.match(/OS ([\d_]+)/);
    if (m) osVersion = m[1].replace(/_/g, ".");
  } else if (/cros/.test(l)) os = "ChromeOS";
  else if (/linux/.test(l)) os = "Linux";

  let deviceType = "desktop";
  if (
    /mobile|iphone|ipod|windows phone/.test(l) ||
    (/android/.test(l) && /mobile/.test(l))
  )
    deviceType = "mobile";
  else if (
    /ipad|tablet|playbook|rim tablet/.test(l) ||
    (/android/.test(l) && !/mobile/.test(l))
  )
    deviceType = "tablet";

  return { browser, browserVersion, os, osVersion, deviceType };
};

const labelOf = (d) => {
  const major = d.browserVersion ? String(d.browserVersion).split(".")[0] : "";
  return (
    [
      d.browser && d.browser !== "Unknown"
        ? `${d.browser}${major ? " " + major : ""}`
        : null,
      d.os && d.os !== "Unknown"
        ? `${d.os}${d.osVersion ? " " + d.osVersion : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Unknown device"
  );
};

// UA Client Hints (low-entropy: sent by Chromium/Brave on EVERY request incl. navigations)
const parseClientHints = (req) => {
  const raw = req.headers?.["sec-ch-ua"];
  if (!raw) return null;
  const blacklist = new Set([
    "chromium",
    "not.a/brand",
    "not?a_brand",
    "not/a)brand",
    "not_a_brand",
    "headlesschrome",
  ]);
  let browser = "",
    browserVersion = "";
  for (const part of String(raw).split(",")) {
    const m = part.trim().match(/^"([^"]+)"\s*;\s*v="([^"]+)"/);
    if (m && !blacklist.has(m[1].toLowerCase()) && !browser) {
      browser = m[1];
      browserVersion = m[2];
    }
  }
  if (!browser) return null;
  const plat =
    cleanStr(
      (req.headers?.["sec-ch-ua-platform"] || "").replace(/"/g, ""),
      40
    ) || "Unknown";
  const mobile = (req.headers?.["sec-ch-ua-mobile"] || "").trim() === "?1";
  return {
    browser,
    browserVersion,
    os: plat,
    osVersion: "",
    deviceType: mobile ? "mobile" : "desktop",
  };
};

// X-Device-Info header (XHR only) / mm_device_info cookie (rides navigations)
const parseCarried = (req) => {
  let obj = null;
  const hdr = req.headers?.["x-device-info"];
  if (hdr && String(hdr).length <= MAX_CARRIED_LEN) {
    try {
      obj = JSON.parse(decodeURIComponent(String(hdr)));
    } catch {}
  }
  if (!obj) {
    const ck = req.cookies?.mm_device_info;
    if (ck && String(ck).length <= MAX_CARRIED_LEN) {
      try {
        obj = JSON.parse(decodeURIComponent(String(ck)));
      } catch {}
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const b = cleanStr(obj.b ?? obj.browser, 40),
    bv = cleanStr(obj.bv ?? obj.browserVersion, 20);
  const o = cleanStr(obj.o ?? obj.os, 40),
    ov = cleanStr(obj.ov ?? obj.osVersion, 20);
  const dt = cleanEnum(obj.dt ?? obj.deviceType, DT, "unknown");
  if (b === "" && o === "") return null;
  return {
    browser: b || "Unknown",
    browserVersion: bv,
    os: o || "Unknown",
    osVersion: ov,
    deviceType: dt,
  };
};

/**
 * Resolve an accurate, sanitized device descriptor for storage/UI.
 * Precedence: X-Device-Info header -> UA Client Hints -> mm_device_info cookie -> UA string.
 */
export const parseDevice = (req) => {
  const ua = String(req?.headers?.["user-agent"] || "").substring(
    0,
    MAX_UA_LENGTH
  );
  const base = parseUaString(ua);
  const carried = parseCarried(req);
  const hints = parseClientHints(req);

  const merged = {
    browser:
      carried?.browser && carried.browser !== "Unknown"
        ? carried.browser
        : hints?.browser ||
          (base.browser !== "Unknown" ? base.browser : "Unknown"),
    browserVersion:
      carried?.browserVersion ||
      hints?.browserVersion ||
      base.browserVersion ||
      "",
    os:
      carried?.os && carried.os !== "Unknown"
        ? carried.os
        : hints?.os && hints.os !== "Unknown"
        ? hints.os
        : base.os !== "Unknown"
        ? base.os
        : "Unknown",
    osVersion: carried?.osVersion || base.osVersion || "",
    deviceType:
      carried?.deviceType && carried.deviceType !== "unknown"
        ? carried.deviceType
        : hints?.deviceType || base.deviceType || "desktop",
  };
  merged.label = labelOf(merged);
  merged.userAgent = ua;
  return merged;
};
