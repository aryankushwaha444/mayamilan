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

const BASE_URL = "https://mayamilan.vercel.app/";
const CHANNEL = "mayamilan-turnstile";
const TIMEOUT_MS = 90_000;
const MAX_TOKEN_LENGTH = 2048;

type Status = "loading" | "ready" | "expired" | "error";

type ChallengeMessage = {
  channel: string;
  nonce: string;
  kind: "ok" | "error" | "expired" | "diagnostic";
  token: string;
  errorCode?: string;
};

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
  const url = new URL("mobile-turnstile.html", BASE_URL);

  url.searchParams.set("sitekey", siteKey);
  url.searchParams.set("nonce", nonce);

  return url.toString();
}

function parseMessage(
  raw: string,
  expectedNonce: string
): ChallengeMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_TOKEN_LENGTH + 1024) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);

    if (!value || typeof value !== "object") {
      return null;
    }

    const message = value as Record<string, unknown>;

    if (
      message.channel !== CHANNEL ||
      message.nonce !== expectedNonce ||
      !["ok", "error", "expired", "diagnostic"].includes(
        String(message.kind)
      ) ||
      typeof message.token !== "string" ||
      message.token.length > MAX_TOKEN_LENGTH
    ) {
      return null;
    }

    if (message.kind === "ok" && message.token.trim().length === 0) {
      return null;
    }

    if (message.kind !== "ok" && message.token !== "") {
      return null;
    }

    if (
      message.errorCode !== undefined &&
      typeof message.errorCode !== "string"
    ) {
      return null;
    }

    return {
      channel: CHANNEL,
      nonce: expectedNonce,
      kind: message.kind as ChallengeMessage["kind"],
      token: message.token,
      errorCode:
        typeof message.errorCode === "string" ? message.errorCode : undefined,
    };
  } catch {
    return null;
  }
}

export function TurnstileBox({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const [nonce, setNonce] = useState(createNonce);
  const [status, setStatus] = useState<Status>(SITE_KEY ? "loading" : "error");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(true);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fail = useCallback(
    (nextStatus: Status) => {
      clearTimer();

      if (!mountedRef.current) return;

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
      setStatus("error");
      console.error("[Turnstile] Missing EXPO_PUBLIC_TURNSTILE_SITEKEY.");
      return;
    }

    setStatus("loading");

    timerRef.current = setTimeout(() => {
      console.error("[Turnstile] No terminal challenge result after timeout.");
      fail("error");
    }, TIMEOUT_MS);

    return clearTimer;
  }, [nonce, clearTimer, fail]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data;

      console.log("[Turnstile] Raw WebView message:", raw);

      const message = parseMessage(raw, nonce);

      if (!message) {
        console.warn("[Turnstile] Ignored invalid or unexpected message.");
        return;
      }

      if (message.kind === "diagnostic") {
        console.log("[Turnstile] Diagnostic:", message.errorCode ?? "unknown");
        return;
      }

      clearTimer();

      if (message.kind === "error") {
        console.error(
          "[Turnstile] Error code:",
          message.errorCode ?? "unknown"
        );
        fail("error");
        return;
      }

      if (message.kind === "expired") {
        fail("expired");
        return;
      }

      setStatus("ready");
      onTokenRef.current(message.token);
    },
    [nonce, clearTimer, fail]
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
          key={nonce}
          source={{
            uri: createChallengeUrl(SITE_KEY, nonce),
          }}
          originWhitelist={["https://*"]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          mixedContentMode="never"
          scrollEnabled={false}
          bounces={false}
          style={styles.web}
          onMessage={handleMessage}
          onLoadStart={() => {
            console.log("[Turnstile] Hosted page load started.");
          }}
          onLoadProgress={({ nativeEvent }) => {
            console.log(
              "[Turnstile] WebView load progress:",
              nativeEvent.progress
            );
          }}
          onLoadEnd={() => {
            console.log("[Turnstile] Hosted page loaded; waiting for token.");
          }}
          onError={({ nativeEvent }) => {
            console.error(
              "[Turnstile] WebView error:",
              nativeEvent.description
            );
            fail("error");
          }}
          onHttpError={({ nativeEvent }) => {
            console.error(
              "[Turnstile] HTTP error:",
              nativeEvent.statusCode,
              nativeEvent.url
            );
          }}
          onRenderProcessGone={({ nativeEvent }) => {
            console.error("[Turnstile] Android renderer exited:", nativeEvent);
            fail("error");
          }}
          onContentProcessDidTerminate={() => {
            console.error("[Turnstile] iOS WebView process terminated.");
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
              ? "Security check is not configured."
              : status === "expired"
              ? "Security check expired. Retry."
              : "Security check unavailable. Retry."}
          </Text>

          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Retry security check"
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
    height: 82,
    borderRadius: radius.chip,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputFill,
    marginBottom: 18,
    position: "relative",
  },
  web: {
    flex: 1,
    backgroundColor: "transparent",
  },
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
  loading: {
    color: colors.subtext,
    fontSize: 13,
  },
  errText: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.iconTint,
  },
  retryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
