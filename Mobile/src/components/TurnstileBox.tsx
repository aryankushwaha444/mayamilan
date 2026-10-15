import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { colors, radius } from "../theme";

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY?.trim() ?? "";
const TIMEOUT_MS = 40_000; // Increased to 90s
const BASE_URL = "https://mayamilan.vercel.app/mobile-turnstile.html";

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
      onTokenRef.current("");
    },
    [clearTimer]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      onTokenRef.current("");
    };
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    onTokenRef.current("");
    if (!SITE_KEY) {
      console.error("[Turnstile] EXPO_PUBLIC_TURNSTILE_SITEKEY missing!");
      setStatus("error");
      return;
    }
    setStatus("loading");
    timerRef.current = setTimeout(() => {
      console.error("[Turnstile] Timed out after 90s");
      fail("error");
    }, TIMEOUT_MS);
    return clearTimer;
  }, [nonce, clearTimer, fail]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        console.log("[Turnstile] Received message:", msg);

        if (msg.channel !== "mayamilan-turnstile" || msg.nonce !== nonce) {
          console.warn("[Turnstile] Ignoring message with wrong nonce");
          return;
        }

        clearTimer();
        if (msg.kind === "error") {
          console.error("[Turnstile] Widget error:", msg.token);
          fail("error");
        } else if (msg.kind === "expired") {
          fail("expired");
        } else if (msg.kind === "ok") {
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

  // Handle URL hash changes (fallback method)
  const onNavigationStateChange = useCallback(
    (navState: any) => {
      const { url } = navState;
      console.log("[Turnstile] Navigation state changed:", url);

      if (url.includes("#turnstile-ok-")) {
        const token = url.split("#turnstile-ok-")[1];
        console.log("[Turnstile] ✅ Got token from URL hash!");
        clearTimer();
        setStatus("ready");
        onTokenRef.current(decodeURIComponent(token));
      } else if (url.includes("#turnstile-error-")) {
        console.error("[Turnstile] Error from URL hash");
        fail("error");
      } else if (url.includes("#turnstile-expired")) {
        fail("expired");
      }
    },
    [clearTimer, fail]
  );

  const retry = useCallback(() => {
    clearTimer();
    onTokenRef.current("");
    setStatus("loading");
    setNonce(createNonce());
  }, [clearTimer]);

  return (
    <View style={styles.box}>
      {SITE_KEY ? (
        <WebView
          ref={webViewRef}
          key={nonce}
          source={{ uri: createChallengeUrl(SITE_KEY, nonce) }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          scrollEnabled={false}
          bounces={false}
          style={styles.web}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url;
            // Allow everything - Cloudflare needs to load from multiple domains
            return true;
          }}
          onMessage={handleMessage}
          onNavigationStateChange={onNavigationStateChange}
          onError={(e) => {
            console.error("[Turnstile] WebView error:", e.nativeEvent);
            fail("error");
          }}
          onHttpError={(e) => {
            console.error(
              "[Turnstile] HTTP error:",
              e.nativeEvent.statusCode,
              e.nativeEvent.url
            );
            if (e.nativeEvent.statusCode >= 400) fail("error");
          }}
          onLoadStart={() =>
            console.log(
              "[Turnstile] Loading:",
              createChallengeUrl(SITE_KEY, nonce)
            )
          }
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
