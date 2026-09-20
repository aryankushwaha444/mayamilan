/**
 * Verify Cloudflare Turnstile token
 * Returns true if valid, false if bot/invalid
 */
export const verifyTurnstile = async (token, ip) => {
  // Skip verification if disabled (for testing)
  if (process.env.TURNSTILE_ENABLED !== "true") {
    console.log("⚠️  Turnstile disabled — skipping verification");
    return true;
  }

  if (!token) {
    console.warn("❌ No Turnstile token provided");
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", process.env.TURNSTILE_SECRET);
    formData.append("response", token);
    if (ip) formData.append("remoteip", ip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }
    );

    const data = await res.json();

    if (!data.success) {
      console.warn("❌ Turnstile failed:", {
        ip,
        errors: data["error-codes"],
      });
    }

    return data.success === true;
  } catch (error) {
    console.error("Turnstile verification error:", error.message);
    // Fail open in production if Cloudflare is down, fail closed in dev
    return process.env.NODE_ENV !== "production";
  }
};
