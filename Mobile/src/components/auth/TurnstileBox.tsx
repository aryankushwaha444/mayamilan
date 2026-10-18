// src/components/auth/TurnstileBox.tsx
//
// Secure Cloudflare Turnstile WebView bridge for React Native / Expo.
//
// SECURITY / ATTACK PREVENTION:
// - Never loads Turnstile from inline html/about:srcdoc.
// - Loads only from your trusted HTTPS bootstrap page.
// - Allows only your bootstrap origin + Cloudflare Turnstile origins.
// - Keeps about:/blob: internal to the WebView.
// - Does not call Linking.openURL for internal WebView frames.
// - Validates token message shape, nonce, origin, and length.
// - Does not log tokens.
// - Fail-closed on missing sitekey/bootstrap URL/origin mismatch/nonce mismatch.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";

import WebView from "react-native-webview";
import * as Crypto from "expo-crypto";

const WV = WebView as any;

export interface TurnstileBoxProps {
  onToken: (token: string) => void;
  onError?: (message: string) => void;
  height?: number;
}

const DEV = typeof __DEV__ !== "undefined" && __DEV__;

const SITEKEY = String(
  process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY || ""
).trim();

const BOOTSTRAP_URL = String(
  process.env.EXPO_PUBLIC_TURNSTILE_BOOTSTRAP_URL ||
    "https://mayamilan.vercel.app/mobile-turnstile.html"
).trim();

const CONTROL_CHARS_RE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

const TOKEN_MAX = 8192;

function cleanText(x: unknown, max = 180): string {
  if (typeof x !== "string") return "";

  return x
    .replace(CONTROL_CHARS_RE, "")
    .trim()
    .slice(0, max);
}

function makeNonce(): string {
  try {
    const bytes = Crypto.getRandomBytesSync(16);

    return Array.from(bytes, (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  } catch {
    return `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }
}

function getOrigin(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return m ? m[1] : "";
}

function getHost(url: string): string {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : "";
}

function getProtocol(url: string): string {
  const m = /^([a-z]+):/i.exec(url);
  return m ? m[1].toLowerCase() : "";
}

export function TurnstileBox({
  onToken,
  onError,
  height = 300,
}: TurnstileBoxProps) {
  const webRef = useRef<any>(null);

  const nonceRef = useRef<string>(makeNonce());
  const consumedRef = useRef<boolean>(false);

  const [nonce, setNonce] = useState<string>(nonceRef.current);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean>(false);

  const bootstrapOrigin = useMemo(() => getOrigin(BOOTSTRAP_URL), []);
  const bootstrapHost = useMemo(() => getHost(BOOTSTRAP_URL), []);

  const src = useMemo(() => {
    if (!SITEKEY || !bootstrapOrigin || !bootstrapHost) return null;

    const base = BOOTSTRAP_URL.split("#")[0];
    const sep = base.includes("?") ? "&" : "?";

    return `${base}${sep}sitekey=${encodeURIComponent(
      SITEKEY
    )}#tn=${encodeURIComponent(nonce)}`;
  }, [bootstrapHost, bootstrapOrigin, nonce]);

  const isTrustedExternalUrl = useCallback(
    (url: string): boolean => {
      if (!url) return false;

      const protocol = getProtocol(url);
      const host = getHost(url);

      if (protocol === "https:") {
        return (
          host === bootstrapHost ||
          host === "challenges.cloudflare.com" ||
          host.endsWith(".cloudflare.com")
        );
      }

      if (DEV && protocol === "http:") {
        return host === "localhost" || host === "127.0.0.1";
      }

      return false;
    },
    [bootstrapHost]
  );

  const originWhitelist = useMemo(() => {
    const list: string[] = [];

    if (bootstrapOrigin) {
      list.push(bootstrapOrigin);
      list.push(`${bootstrapOrigin}:*`);
    }

    list.push("https://challenges.cloudflare.com");
    list.push("https://challenges.cloudflare.com:*");

    list.push("https://*.cloudflare.com");
    list.push("https://*.cloudflare.com:*");

    // Internal WebView schemes.
    // These must stay inside the WebView and must never be opened externally.
    list.push("about:");
    list.push("about:*");
    list.push("blob:");
    list.push("blob:*");

    if (DEV) {
      list.push("http://localhost:*");
      list.push("http://127.0.0.1:*");
    }

    return Array.from(new Set(list.filter(Boolean)));
  }, [bootstrapOrigin]);

  const fail = useCallback(
    (message: unknown) => {
      const safe =
        cleanText(message, 180) || "Turnstile verification failed";

      setError(safe);
      setReady(false);
      onError?.(safe);
    },
    [onError]
  );

  const reset = useCallback(() => {
    consumedRef.current = false;
    setError(null);
    setReady(false);

    const next = makeNonce();
    nonceRef.current = next;
    setNonce(next);
  }, []);

  useEffect(() => {
    consumedRef.current = false;
    setError(null);
    setReady(false);
  }, [src]);

  const onShouldStartLoadWithRequest = useCallback(
    (event: any): boolean => {
      const url =
        typeof event?.url === "string"
          ? event.url
          : typeof event?.nativeEvent?.url === "string"
          ? event.nativeEvent.url
          : "";

      if (!url) return false;

      // Keep internal schemes inside the WebView.
      // Do not send these to Linking.openURL(); that causes the iOS warning.
      if (url.startsWith("about:") || url.startsWith("blob:")) {
        return true;
      }

      return isTrustedExternalUrl(url);
    },
    [isTrustedExternalUrl]
  );

  const onOpenWindow = useCallback((event: any) => {
    const url = event?.nativeEvent?.url;

    if (typeof url !== "string" || !url) return;

    // Never externalize internal WebView frames.
    if (url.startsWith("about:") || url.startsWith("blob:")) {
      return;
    }

    // Mobile Turnstile bridge does not need popups.
    // Ignore all window.open requests to prevent external URL handling.
  }, []);

  const injectedJavaScriptBeforeContentLoaded = useMemo(
    () => `
(function () {
  try {
    window.open = function () {
      return null;
    };
  } catch (e) {}
})();
true;
`,
    []
  );

  const onMessage = useCallback(
    (event: any) => {
      try {
        const raw = event?.nativeEvent?.data;

        if (!raw || typeof raw !== "string") return;

        let msg: any;

        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (!msg || typeof msg !== "object") return;

        const msgType = cleanText(msg.type, 80);
        const msgNonce = cleanText(msg.nonce, 128);

        if (msgType === "turnstile-ready") {
          if (msgNonce !== nonceRef.current) return;

          setReady(true);
          setError(null);
          return;
        }

        if (msgType === "turnstile-error") {
          if (msgNonce && msgNonce !== nonceRef.current) return;

          const code =
            typeof msg.code === "string" || typeof msg.code === "number"
              ? String(msg.code)
              : "";

          const base =
            typeof msg.error === "string"
              ? msg.error
              : "Turnstile verification failed";

          fail(code ? `${base} (${code})` : base);
          return;
        }

        if (msgType === "turnstile-token") {
          if (consumedRef.current) return;

          const token =
            typeof msg.token === "string" ? msg.token.trim() : "";

          const origin =
            typeof msg.origin === "string"
              ? msg.origin
              : typeof msg.pageOrigin === "string"
              ? msg.pageOrigin
              : "";

          if (!token || token.length > TOKEN_MAX) {
            fail("Invalid Turnstile token");
            return;
          }

          if (!nonceRef.current || msgNonce !== nonceRef.current) {
            fail("Turnstile nonce mismatch");
            return;
          }

          if (bootstrapOrigin && origin !== bootstrapOrigin) {
            fail("Turnstile origin mismatch");
            return;
          }

          consumedRef.current = true;
          setError(null);
          setReady(true);
          onToken(token);
          return;
        }
      } catch {
        fail("Turnstile message error");
      }
    },
    [bootstrapOrigin, fail, onToken]
  );

  if (!SITEKEY) {
    return (
      <View style={[st.box, { height }]}>
        <Text style={st.errTitle}>Turnstile not configured</Text>
        <Text style={st.errBody}>
          EXPO_PUBLIC_TURNSTILE_SITEKEY is missing.
        </Text>
      </View>
    );
  }

  if (!bootstrapOrigin || !bootstrapHost || !src) {
    return (
      <View style={[st.box, { height }]}>
        <Text style={st.errTitle}>Turnstile bootstrap invalid</Text>
        <Text style={st.errBody}>
          EXPO_PUBLIC_TURNSTILE_BOOTSTRAP_URL must be a valid HTTPS URL.
        </Text>
      </View>
    );
  }

  return (
    <View style={[st.box, { height }]}>
      <WV
        key={src}
        ref={webRef}
        source={{ uri: src }}
        javaScriptEnabled
        domStorageEnabled
        cookiesEnabled
        thirdPartyCookiesEnabled={Platform.OS === "android"}
        mixedContentMode="never"
        originWhitelist={originWhitelist}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={onOpenWindow}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={
          injectedJavaScriptBeforeContentLoaded
        }
        startInLoadingState
        renderLoading={() => (
          <View style={st.loading}>
            <ActivityIndicator color="#7c3aed" />
            <Text style={st.loadingText}>Loading verification…</Text>
          </View>
        )}
        onError={() => {
          fail("WebView failed to load Turnstile");
        }}
        onHttpError={() => {
          fail("Turnstile bootstrap returned HTTP error");
        }}
        style={st.web}
      />

      {!!error && (
        <View style={st.errorOverlay}>
          <Text style={st.errTitle}>Verification failed</Text>
          <Text style={st.errBody}>{error}</Text>

          <TouchableOpacity style={st.retryBtn} onPress={reset}>
            <Text style={st.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!ready && !error && (
        <View pointerEvents="none" style={st.hint}>
          <Text style={st.hintText}>Waiting for Cloudflare Turnstile…</Text>
        </View>
      )}
    </View>
  );
}

export default TurnstileBox;

const st = StyleSheet.create({
  box: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  web: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  errorOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  errTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#b91c1c",
    marginBottom: 4,
  },
  errBody: {
    fontSize: 13,
    color: "#0f172a",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#7c3aed",
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  hint: {
    position: "absolute",
    left: 12,
    bottom: 10,
  },
  hintText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
});