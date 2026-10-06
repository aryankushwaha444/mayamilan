const ID_KEY = "mm_device_id";
const ID_COOKIE = "mm_device_id";
const INFO_COOKIE = "mm_device_info";
const MAX_COOKIE = 900; // keep well under the 4KB cookie budget

// ── cookie helpers ──────────────────────────────────────────────
const readCookie = (name) => {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
};
const writeCookie = (name, value) => {
  try {
    const secure = window.location.protocol === "https:";
    const sameSite = secure ? "None" : "Lax";
    const maxAge = 60 * 60 * 24 * 400; // ~400 days, matches refresh window
    document.cookie =
      `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; ` +
      `SameSite=${sameSite}${secure ? "; Secure" : ""}`;
  } catch {
    /* privacy mode / blocked -> degrade to header+Hints server-side */
  }
};

// ── stable id (localStorage primary, cookie mirror) ─────────────
const genId = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
const ensureId = () => {
  let id = null;
  try {
    id = localStorage.getItem(ID_KEY) || readCookie(ID_COOKIE);
  } catch {}
  if (!id) {
    id = genId();
    try {
      localStorage.setItem(ID_KEY, id);
    } catch {}
  } else {
    try {
      localStorage.setItem(ID_KEY, id);
    } catch {}
  }
  writeCookie(ID_COOKIE, id);
  return id;
};

// ── synchronous UA seed (correct fork ordering incl. Brave/Vivaldi) ──
const parseUaSync = (ua) => {
  const l = ua.toLowerCase();
  let browser = "Unknown",
    browserVersion = "";
  const ver = (re) => {
    const m = ua.match(re);
    return m ? m[1] : "";
  };
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
    osVersion = /windows nt 10\.0/.test(l) && /11/.test(ua) ? "11" : "10";
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

const composeLabel = (d) => {
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

// ── module-level cache (sync reads) ─────────────────────────────
let cached = null;

const buildDescriptor = async (id) => {
  const ua = navigator.userAgent || "";
  const d = parseUaSync(ua); // start from UA seed

  // Upgrade with UA-Data (gives real platform version + correct Chromium brands)
  const uad = navigator.userAgentData;
  if (uad && typeof uad.getHighEntropyValues === "function") {
    try {
      const hv = await uad.getHighEntropyValues([
        "brands",
        "platform",
        "platformVersion",
        "model",
      ]);
      const blacklist = new Set([
        "chromium",
        "not.a/brand",
        "not?a_brand",
        "not/a)brand",
        "not_a_brand",
        "headlesschrome",
      ]);
      const brand = (hv.brands || []).find(
        (b) => b.brand && !blacklist.has(String(b.brand).toLowerCase())
      );
      if (brand) {
        d.browser = brand.brand;
        d.browserVersion = brand.version || d.browserVersion;
      }
      if (hv.platform) d.os = hv.platform;
      if (hv.platformVersion) d.osVersion = hv.platformVersion; // real macOS 15.x, not frozen 10.15.7
      if (uad.mobile) d.deviceType = "mobile";
      else if (/ipad|tablet/i.test(ua) || d.os === "iPadOS")
        d.deviceType = "tablet";
    } catch {}
  }

  // Brave explicit (covers builds where UA-Data omits the Brave brand)
  try {
    if (navigator.brave && (await navigator.brave.isBrave()))
      d.browser = "Brave";
  } catch {}

  d.label = composeLabel(d);
  d.id = id;
  return d;
};

const persistDescriptor = (d) => {
  cached = d;
  try {
    writeCookie(INFO_COOKIE, JSON.stringify(d).slice(0, MAX_COOKIE));
  } catch {}
};

// Sync seed at load (so a cookie exists even before the async upgrade lands)
export const getDeviceId = () => {
  const id = ensureId();
  if (!cached) {
    const seed = parseUaSync(navigator.userAgent || "");
    seed.id = id;
    seed.label = composeLabel(seed);
    persistDescriptor(seed);
  }
  return id;
};

// Sync accessor for the interceptor (returns last-known descriptor)
export const getDeviceInfo = () => cached;

// Async upgrade — call once at app boot; rewrites cookie/cache with accurate data
export const refreshDeviceIdentity = async () => {
  const id = ensureId();
  try {
    persistDescriptor(await buildDescriptor(id));
  } catch {}
  return id;
};

// Plant everything the moment this module is imported (before any Google click)
try {
  getDeviceId();
  refreshDeviceIdentity();
} catch {}
