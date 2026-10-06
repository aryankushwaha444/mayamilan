import geoip from "geoip-lite";

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

/**
 * Normalize an IP address:
 * - Trims and lowercases
 * - Strips IPv4-mapped IPv6 prefix (::ffff:192.168.1.1 -> 192.168.1.1)
 */
const normalizeIp = (ip) => {
  if (!ip || typeof ip !== "string") return null;

  let clean = ip.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 in dotted-decimal form (::ffff:192.168.1.1)
  const mappedMatch = clean.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
  );
  if (mappedMatch) {
    return mappedMatch[1];
  }

  return clean;
};

/**
 * Detect private / reserved IPv4 ranges
 */
const isPrivateIPv4 = (ip) => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8   — "this" network
    a === 10 || // 10.0.0.0/8  — private
    a === 127 || // 127.0.0.0/8 — loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 — link-local
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 — private
    (a === 192 && b === 168) // 192.168.0.0/16 — private
  );
};

/**
 * Detect private / reserved IPv6 ranges
 */
const isPrivateIPv6 = (ip) => {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" || // loopback
    lower.startsWith("fc") || // unique local (fc00::/8)
    lower.startsWith("fd") || // unique local (fd00::/8)
    lower.startsWith("fe80") // link-local (fe80::/10)
  );
};

const UNKNOWN_RESULT = {
  country: "Unknown",
  city: "Unknown",
  region: "Unknown",
  coordinates: null, // ✅ null instead of [0,0] to avoid "Null Island"
};

// ═══════════════════════════════════════════
// MAIN LOOKUP
// ═══════════════════════════════════════════

export const lookupIp = (ip) => {
  try {
    const cleanIp = normalizeIp(ip);

    // 1. Handle missing / malformed input
    if (!cleanIp) {
      return { ...UNKNOWN_RESULT };
    }

    // 2. Handle localhost explicitly
    if (
      cleanIp === "localhost" ||
      cleanIp === "127.0.0.1" ||
      cleanIp === "::1"
    ) {
      return {
        country: "Local",
        city: "Localhost",
        region: "Local",
        coordinates: null,
      };
    }

    // 3. ✅ Detect private/reserved ranges BEFORE hitting the geo DB
    if (isPrivateIPv4(cleanIp) || isPrivateIPv6(cleanIp)) {
      return {
        country: "Private",
        city: "Internal Network",
        region: "Private",
        coordinates: null,
      };
    }

    // 4. Perform the actual lookup
    const geo = geoip.lookup(cleanIp);

    if (!geo) {
      return { ...UNKNOWN_RESULT };
    }

    // 5. ✅ Convert coordinates to GeoJSON order [longitude, latitude]
    // geoip-lite returns geo.ll as [latitude, longitude]
    // MongoDB 2dsphere / GeoJSON expects [longitude, latitude]
    let coordinates = null;
    if (Array.isArray(geo.ll) && geo.ll.length === 2) {
      const [lat, lon] = geo.ll;
      if (typeof lat === "number" && typeof lon === "number") {
        coordinates = [lon, lat]; // ✅ SWAPPED to GeoJSON order
      }
    }

    return {
      country: geo.country || "Unknown",
      city: geo.city || "Unknown",
      region: geo.region || "Unknown",
      timezone: geo.timezone || null,
      coordinates,
    };
  } catch (err) {
    console.warn("GeoIP lookup failed:", err.message);
    return { ...UNKNOWN_RESULT };
  }
};
