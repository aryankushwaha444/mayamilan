// server/turn-check.mjs  — run: node turn-check.mjs  (from server/)
// Corrected base namespace: /calls/turn (the ONLY one your router accepts).
// Reads the real TURN KEY id from the API instead of guessing it.
import { readFileSync, existsSync } from "node:fs";
const env = {};
if (existsSync(".env"))
  for (const l of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t[0] === "#") continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))
      v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v;
  }
const T = (env.CLOUDFLARE_API_TOKEN || "").trim();
const ACC = (env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const mask = (s) =>
  s ? String(s).slice(0, 4) + "…" + String(s).slice(-2) : "(empty)";
if (!T || !ACC) {
  console.log("VERDICT: missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
  process.exit(2);
}
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACC}/calls/turn`;
const H = { Authorization: `Bearer ${T}`, "Content-Type": "application/json" };
async function req(m, u, b) {
  const c = new AbortController(),
    to = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(u, {
      method: m,
      headers: H,
      body: b ? JSON.stringify(b) : undefined,
      signal: c.signal,
    });
    let j = {};
    try {
      j = await r.json();
    } catch {}
    return { s: r.status, j };
  } catch (e) {
    return {
      s: 0,
      j: { errors: [{ message: String((e && e.message) || e) }] },
    };
  } finally {
    clearTimeout(to);
  }
}
const msg = (o) =>
  (
    (o && o.errors && o.errors[0] && o.errors[0].message) ||
    (o && o.message) ||
    ""
  ).slice(0, 80);
const hasIce = (o) => {
  const l =
    (o && o.result && (o.result.iceServers || o.result.turnServers)) || [];
  return Array.isArray(l) && l.length > 0;
};
const idsOf = (j) => {
  const r = j && j.result;
  const arr = Array.isArray(r)
    ? r
    : r && Array.isArray(r.keys)
    ? r.keys
    : r && Array.isArray(r.apps)
    ? r.apps
    : [];
  return arr.map((x) => x && (x.id || x.keyId || x.appId)).filter(Boolean);
};

const v = await req(
  "GET",
  "https://api.cloudflare.com/client/v4/user/tokens/verify"
);
console.log(`verify=${v.s} ok=${!!(v.j && v.j.success)} | ${msg(v.j)}`);

const keysRes = await req("GET", `${BASE}/keys`);
const appsRes = await req("GET", `${BASE}/apps`);
const keyIds = idsOf(keysRes.j);
const appIds = idsOf(appsRes.j);
console.log(
  `GET /calls/turn/keys -> ${keysRes.s} | ids: ${
    keyIds.map(mask).join(", ") || "(none)"
  } | ${msg(keysRes.j)}`
);
console.log(
  `GET /calls/turn/apps -> ${appsRes.s} | ids: ${
    appIds.map(mask).join(", ") || "(none)"
  } | ${msg(appsRes.j)}`
);
console.log(
  `(your env id 11b2…93 is in the APPS list${
    appIds.some((x) => x.startsWith("11b2"))
      ? " — confirmed it is an APP id, not a KEY id"
      : ""
  })\n`
);

let win = null;
for (const kid of keyIds) {
  const u = `${BASE}/keys/${encodeURIComponent(kid)}/credentials/generate`;
  let g = await req("POST", u, { ttl: 3600 });
  if (g.s === 405) g = await req("GET", u);
  const ok = !!(g.j && g.j.success) && hasIce(g.j);
  console.log(`cred[key ${mask(kid)}]=${g.s} ok=${ok} | ${msg(g.j)}`);
  if (ok && !win) win = { kid, u };
}

if (win) {
  console.log("\n=== FOUND THE REAL KEY id ===");
  console.log(
    "Set BOTH of these (replace 11b2…93 everywhere with the KEY id below):"
  );
  console.log(`CLOUDFLARE_TURN_KEY_ID=${win.kid}`);
  console.log(`CLOUDFLARE_TURN_CREDENTIALS_URL=${win.u}`);
  console.log(
    "Put them in server/.env AND Render, restart both, place ONE call -> log must read relay=YES."
  );
  process.exit(0);
}

if (!keyIds.length) {
  console.log(
    "\nVERDICT: the /calls/turn namespace is correct, but you have NO TURN KEY yet (the keys list is empty). The app id will never work in the /keys/ slot."
  );
  console.log(
    "Create a key — either in the dashboard (Realtime -> TURN Server -> open mayamilan-production -> Keys -> Create key),"
  );
  console.log(
    "or with this one command (you only need the returned id; the secret is NOT needed for this API flow):"
  );
  console.log(
    `  curl -sS -X POST "${BASE}/keys" -H "Authorization: Bearer <NEW_TOKEN>" -H "Content-Type: application/json" -d '{}'`
  );
  console.log("Then rerun: node turn-check.mjs");
  process.exit(2);
}

console.log(
  "\nVERDICT: keys exist but generate still rejected. Paste ONLY the cred[key …] lines above. (Scope is already Calls:Edit per your screenshot, so this would be the last unknown, and it is read from the API, not guessed.)"
);
