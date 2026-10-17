// src/components/auth/TurnstileBox.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors, radius } from "../../theme";

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY?.trim() ?? "";
// The pinned bootstrap page (verified live: fetching it returns "Initializing Turnstile...").
// This is the ONLY document allowed to set the top-level #turnstile-ok- hash.
const BASE_URL = "https://mayamilan.vercel.app/mobile-turnstile.html";
const TRUSTED_BOOTSTRAP_ORIGIN = "https://mayamilan.vercel.app";
// The Turnstile widget itself is served by Cloudflare (the challenges.cloudflare.com page
// confirms "Turnstile is a Cloudflare security product"), so these hosts are the legitimate
// challenge endpoints and MUST be allowed to LOAD and to be a postMessage origin. Allowing
// them is NOT a token shortcut: a token is accepted only when it ALSO carries the per-mount
// nonce (postMessage path) or is set on the bootstrap document's OWN hash (fallback path).
const TRUSTED_HOSTS = ["mayamilan.vercel.app", "challenges.cloudflare.com"];
const TOKEN_MAX = 4096; // Turnstile tokens are a few hundred chars; cap absurd/DoS payloads.
const TIMEOUT_MS = 90_000; // 90s (was 40_000 with a "90s" comment+log — now consistent & derived)

type Status = "loading" | "ready" | "expired" | "error";

function createNonce(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

function isTrustedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  // dotted-suffix match => "fake.cloudflare.com.evil.com" and "notcloudflare.com" both fail.
  return TRUSTED_HOSTS.some((t) => h === t || h.endsWith("." + t));
}

// Returns the origin of a url, or null if unparseable (callers treat null as "do not trust").
function originOf(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// postMessage origin gate: https + a trusted host. A non-https or foreign host is rejected.
function isTrustedMessageOrigin(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && isTrustedHost(u.hostname);
  } catch {
    return false;
  }
}

function isUsableToken(t: unknown): t is string {
  return typeof t === "string" && t.length > 0 && t.length <= TOKEN_MAX;
}

function createChallengeUrl(siteKey: string, nonce: string): string {
  return `${BASE_URL}?sitekey=${encodeURIComponent(
    siteKey
  )}&nonce=${encodeURIComponent(nonce)}`;
}

export function TurnstileBox({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const [nonce, setNonce] = useState(createNonce);
  const [status, setStatus] = useState<Status>(SITE_KEY ? "loading" : "error");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTokenRef = useRef(onToken);
  const mountedRef = useRef(true);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    // Sitekeys are PUBLIC by design (embedded in the page for any visitor), so a prefix in
    // the log is not a secret; kept only to diagnose a missing EXPO_PUBLIC_TURNSTILE_SITEKEY.
    console.log(
      "[Turnstile] Site Key:",
      SITE_KEY ? `${SITE_KEY.substring(0, 10)}...` : "MISSING"
    );
    onTokenRef.current = onToken;
  }, [onToken]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fail = useCallback(
    (nextStatus: Status) => {
      clearTimer();
      if (!mountedRef.current) return;
      console.error("[Turnstile] Failing with status:", nextStatus);
      setStatus(nextStatus);
      onTokenRef.current(""); // emit empty => parent gate closes (fail-closed)
    },
    [clearTimer]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      onTokenRef.current(""); // unmount clears any in-flight token so a torn-down screen
    };                           // never leaves a stale token in the parent (replay guard)
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    onTokenRef.current(""); // fresh challenge => drop the previous (spent) token
    if (!SITE_KEY) {
      console.error("[Turnstile] EXPO_PUBLIC_TURNSTILE_SITEKEY missing!");
      setStatus("error");
      return;
    }
    setStatus("loading");
    timerRef.current = setTimeout(() => {
      console.error(`[Turnstile] Timed out after ${Math.round(TIMEOUT_MS / 1000)}s`);
      fail("error");
    }, TIMEOUT_MS);
    return clearTimer;
  }, [nonce, clearTimer, fail]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        // SECURITY (origin gate, defense-in-depth over the nonce): reject messages whose
        // originating document is not a trusted host BEFORE reading the token. If a build
        // omits nativeEvent.url we cannot determine origin, so we FALL THROUGH to the nonce
        // check (still adequate: the nonce is a per-mount secret only the bootstrap page
        // holds). A malformed/foreign url is rejected outright.
        const rawUrl = event.nativeEvent?.url;
        if (
          typeof rawUrl === "string" &&
          rawUrl.length > 0 &&
          !isTrustedMessageOrigin(rawUrl)
        ) {
          console.warn("[Turnstile] Ignoring message from untrusted origin");
          return;
        }

        const msg = JSON.parse(event.nativeEvent.data);
        // NOTE: never log `msg` or `msg.token` — the token is a single-use credential and
        // console output can surface in dev builds / logcat / Sentry breadcrumbs.
        console.log("[Turnstile] message kind=", typeof msg?.kind === "string" ? msg.kind : "?");

        if (msg.channel !== "mayamilan-turnstile" || msg.nonce !== nonce) {
          console.warn("[Turnstile] Ignoring message with wrong channel/nonce");
          return;
        }

        clearTimer();
        if (msg.kind === "error") {
          console.error("[Turnstile] Widget error"); // token intentionally not logged
          fail("error");
        } else if (msg.kind === "expired") {
          fail("expired");
        } else if (msg.kind === "ok") {
          if (!isUsableToken(msg.token)) {
            fail("error"); // shape/length guard: never emit a junk/oversized "token"
            return;
          }
          console.log("[Turnstile] ✅ SUCCESS! Token received");
          setStatus("ready");
          onTokenRef.current(msg.token);
        }
      } catch (e) {
        console.warn("[Turnstile] Parse error:", e);
      }
    },
    [nonce, clearTimer, fail]
  );

  // URL-hash fallback. SECURITY: a token is trusted ONLY when it is set on the bootstrap
  // document's own hash (origin === TRUSTED_BOOTSTRAP_ORIGIN). The previous code trusted
  // `url.includes("#turnstile-ok-")` from ANY origin, which — combined with a permissive
  // load gate — let a hostile top-level navigation forge acceptance. We also parse the hash
  // precisely (startsWith+slice, not a substring split that also matches the marker inside a
  // path/query), guard decodeURIComponent, cap the token, and stop logging the url (it can
  // carry the token in the hash).
  const onNavigationStateChange = useCallback(
    (navState: any) => {
      const url = navState?.url;
      if (typeof url !== "string" || !url) return;

      const origin = originOf(url);
      if (origin !== TRUSTED_BOOTSTRAP_ORIGIN) return; // foreign/!bootstrap => ignore entirely

      let hash = "";
      try {
        hash = new URL(url).hash;
      } catch {
        return;
      }

      if (hash.startsWith("#turnstile-ok-")) {
        const raw = hash.slice("#turnstile-ok-".length);
        if (!raw) return;
        let token = raw;
        try {
          token = decodeURIComponent(raw);
        } catch {
          fail("error"); // malformed percent-encoding => fail closed, never throw in nav handler
          return;
        }
        if (!isUsableToken(token)) {
          fail("error");
          return;
        }
        clearTimer();
        setStatus("ready");
        onTokenRef.current(token);
      } else if (hash.startsWith("#turnstile-error-")) {
        fail("error");
      } else if (hash.startsWith("#turnstile-expired")) {
        fail("expired");
      }
    },
    [clearTimer, fail]
  );

  const retry = useCallback(() => {
    clearTimer();
    onTokenRef.current("");
    setStatus("loading");
    setNonce(createNonce()); // new nonce => key={nonce} remounts the WebView = fresh challenge
  }, [clearTimer]);

  return (
    <View style={styles.box}>
      {SITE_KEY ? (
        <WebView
          ref={webViewRef}
          key={nonce}
          source={{ uri: createChallengeUrl(SITE_KEY, nonce) }}
          originWhitelist={[
            "https://mayamilan.vercel.app",
            "https://challenges.cloudflare.com",
            "https://*.challenges.cloudflare.com",
            "https://*.cloudflare.com",
          ]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          scrollEnabled={false}
          bounces={false}
          style={styles.web}
          onShouldStartLoadWithRequest={(request) => {
            // Load-layer guard: block non-http(s) schemes (javascript:, data:, file:) which are
            // pure injection surface and never used by the widget. We deliberately keep http(s)
            // permissive so the Cloudflare challenge (which loads from multiple cf hosts) is not
            // broken — the TOKEN trust boundary is enforced at the parse layer (origin+nonce in
            // handleMessage, origin in the hash fallback), NOT here. A hostile http(s) nav may
            // load, but its hash is rejected (origin gate) and it cannot forge a nonce, so the
            // worst case is a failed challenge => timeout => fail("error") => Retry (fail-closed).
            const u = request?.url;
            if (typeof u !== "string" || !/^https?:/i.test(u)) return false;
            return true;
          }}
          onMessage={handleMessage}
          onNavigationStateChange={onNavigationStateChange}
          onError={(e) => {
            console.error("[Turnstile] WebView error:", e.nativeEvent?.code ?? "unknown");
            fail("error");
          }}
          onHttpError={(e) => {
            console.error(
              "[Turnstile] HTTP error:",
              e.nativeEvent?.statusCode ?? 0
            );
            if ((e.nativeEvent?.statusCode ?? 0) >= 400) fail("error");
          }}
          onLoadEnd={() => console.log("[Turnstile] Page load completed")}
          onContentProcessDidTerminate={() => {
            console.error("[Turnstile] Content process terminated");
            fail("error");
          }}
        />
      ) : null}

      {status === "loading" && (
        <View pointerEvents="none" style={styles.overlay}>
          <ActivityIndicator color={colors.iconTint} />
          <Text style={styles.loading}>Verifying security…</Text>
        </View>
      )}

      {(status === "error" || status === "expired") && (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Text style={styles.errText}>
            {!SITE_KEY
              ? "Security check not configured."
              : status === "expired"
              ? "Security check expired."
              : "Security check unavailable."}
          </Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 120,
    borderRadius: radius.chip,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputFill,
    marginBottom: 18,
    position: "relative",
  },
  web: { flex: 1, backgroundColor: "transparent" },
  overlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.inputFill,
    zIndex: 2,
    paddingHorizontal: 12,
  },
  loading: { color: colors.subtext, fontSize: 13 },
  errText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.iconTint,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});