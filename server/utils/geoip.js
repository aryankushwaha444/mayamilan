// server/utils/geoip.js
import geoip from "geoip-lite";

export const lookupIp = (ip) => {
  try {
    if (!ip || ip === "::1" || ip === "127.0.0.1" || ip === "localhost") {
      return { country: "Local", city: "Localhost", region: "Local" };
    }

    const cleanIp = ip.replace(/^::ffff:/, "");
    const geo = geoip.lookup(cleanIp);

    if (!geo) {
      return { country: "Unknown", city: "Unknown", region: "Unknown" };
    }

    return {
      country: geo.country || "Unknown",
      city: geo.city || "Unknown",
      region: geo.region || "Unknown",
      coordinates: geo.ll || [0, 0],
    };
  } catch (err) {
    console.warn("GeoIP lookup failed:", err.message);
    return { country: "Unknown", city: "Unknown", region: "Unknown" };
  }
};
