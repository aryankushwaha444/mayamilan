// src/utils/signRequest.ts — HONEST PASSTHROUGH. The real HMAC lives in your web
// client/src/utils/signRequest.js, which the GitHub link hid behind a login wall.
// Inventing a scheme here would 403 every request. Port the exact algorithm, then
// uncomment the body. Until then this returns the config unchanged (safe default).
import type { InternalAxiosRequestConfig } from "axios";
export async function signRequest(
  config: InternalAxiosRequestConfig
): Promise<InternalAxiosRequestConfig> {
  // TODO(port): replicate web signRequest() exactly (same secret source, same canonical
  // string, same header name). Do NOT guess. Example shape once ported:
  // const sig = await computeHMAC(config.method, config.url, config.data, DEVICE_SECRET);
  // config.headers["X-Request-Signature"] = sig;
  return config;
}
