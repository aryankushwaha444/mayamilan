import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  WebView,
  type WebViewMessageEvent,
} from "react-native-webview";

import { colors, radius } from "../theme";

// This is the PUBLIC site key, not the Cloudflare secret key.
const TURNSTILE_SITEKEY =
  process.env.EXPO_PUBLIC_TURNSTILE_SITEKEY?.trim() ?? "";

const CF_ORIGIN = "https://challenges.cloudflare.com";
const TURNSTILE_BASE_URL = "https://mayamilan.vercel.app/";

const BOOTSTRAP_TIMEOUT_MS = 30_000;
const MAX_TOKEN_LEN = 2048;
const MAX_MESSAGE_LEN = MAX_TOKEN_LEN + 1024;

type Status = "loading" | "ready" | "expired" | "error";
type MessageKind = "ok" | "error" | "expired";

type TurnstileMessage = {
  channel: "mayamilan-turnstile";
  nonce: string;
  kind: MessageKind;
  token: string;
};

function createNonce(): string {
  // Correlation value only; it is not a security credential.
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

function buildHtml(sitekey: string, nonce: string): string {
  const safeSitekey = JSON.stringify(sitekey);
  const safeNonce = JSON.stringify(nonce);
  const safeOrigin = JSON.stringify(CF_ORIGIN);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1"
  >
  <meta name="referrer" content="strict-origin-when-cross-origin">

  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 70px;
      overflow: hidden;
      background: transparent;
      font-family: -apple-system, system-ui, sans-serif;
    }

    #cf {
      width: 100%;
      min-height: 65px;
    }
  </style>
</head>

<body>
  <div id="cf"></div>

  <script>
    (function () {
      "use strict";

      var CHANNEL = "mayamilan-turnstile";
      var NONCE = ${safeNonce};
      var SITEKEY = ${safeSitekey};
      var CF_ORIGIN = ${safeOrigin};

      var tokenDelivered = false;
      var errorDelivered = false;
      var expiredDelivered = false;
      var widgetRendered = false;

      function post(kind, token) {
        try {
          if (
            !window.ReactNativeWebView ||
            typeof window.ReactNativeWebView.postMessage !== "function"
          ) {
            return;
          }

          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              channel: CHANNEL,
              nonce: NONCE,
              kind: kind,
              token: typeof token === "string" ? token : ""
            })
          );
        } catch (error) {
          console.error("Turnstile message delivery failed.");
        }
      }

      function terminal(kind, token) {
        if (kind === "ok") {
          if (tokenDelivered) return;
          tokenDelivered = true;
        } else if (kind === "error") {
          if (errorDelivered) return;
          errorDelivered = true;
        } else if (kind === "expired") {
          if (expiredDelivered) return;
          expiredDelivered = true;
        }

        post(kind, token);
      }

      window.mmTurnstileReady = function () {
        try {
          if (widgetRendered) return;

          if (
            !window.turnstile ||
            typeof window.turnstile.render !== "function"
          ) {
            console.error("Turnstile API is unavailable.");
            terminal("error", "");
            return;
          }

          widgetRendered = true;

          window.turnstile.render("#cf", {
            sitekey: SITEKEY,
            theme: "light",
            size: "flexible",

            callback: function (token) {
              if (
                typeof token !== "string" ||
                token.trim().length === 0 ||
                token.length > ${MAX_TOKEN_LEN}
              ) {
                terminal("error", "");
                return;
              }

              // This token must still be verified by the backend.
              terminal("ok", token);
            },

            "error-callback": function (code) {
              console.error("Turnstile challenge error:", code);
              terminal("error", "");
            },

            "expired-callback": function () {
              terminal("expired", "");
            }
          });
        } catch (error) {
          console.error("Turnstile initialization failed.");
          terminal("error", "");
        }
      };

      // Detect failure to download the Cloudflare API script.
      window.addEventListener(
        "error",
        function (event) {
          var target = event && event.target;

          if (
            target &&
            target.tagName === "SCRIPT" &&
            typeof target.src === "string" &&
            target.src.indexOf(CF_ORIGIN + "/turnstile/") === 0
          ) {
            console.error("Could not load the Turnstile API script.");
            terminal("error", "");
          }
        },
        true
      );

      // Catch unexpected JavaScript failures.
      window.addEventListener("unhandledrejection", function () {
        console.error("Turnstile encountered an asynchronous error.");
      });
    })();
  </script>

  <script
    src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=mmTurnstileReady"
    async
    defer
  ></script>
</body>
</html>`;
}

function parseMessage(
  raw: string,
  expectedNonce: string
): TurnstileMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_LEN) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const value = parsed as Record<string, unknown>;

  if (
    value.channel !== "mayamilan-turnstile" ||
    value.nonce !== expectedNonce ||
    (value.kind !== "ok" &&
      value.kind !== "error" &&
      value.kind !== "expired") ||
    typeof value.token !== "string"
  ) {
    return null;
  }

  if (value.token.length > MAX_TOKEN_LEN) {
    return null;
  }

  if (value.kind !== "ok" && value.token !== "") {
    return null;
  }

  if (
    value.kind === "ok" &&
    value.token.trim().length === 0
  ) {
    return null;
  }

  return {
    channel: "mayamilan-turnstile",
    nonce: expectedNonce,
    kind: value.kind,
    token: value.token,
  };
}

export function TurnstileBox({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const [nonce, setNonce] = useState(createNonce);

  const [status, setStatus] = useState<Status>(
    TURNSTILE_SITEKEY ? "loading" : "error"
  );

  const timerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTokenRef = useRef(onToken);
  const mountedRef = useRef(true);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearToken = useCallback(() => {
    onTokenRef.current("");
  }, []);

  const failClosed = useCallback(
    (nextStatus: Status) => {
      clearTimer();

      if (!mountedRef.current) return;

      setStatus(nextStatus);
      clearToken();
    },
    [clearTimer, clearToken]
  );

  const startTimer = useCallback(() => {
    clearTimer();

    if (!TURNSTILE_SITEKEY) {
      failClosed("error");
      return;
    }

    timerRef.current = setTimeout(() => {
      console.error(
        "[Turnstile] Timed out waiting for challenge completion."
      );
      failClosed("error");
    }, BOOTSTRAP_TIMEOUT_MS);
  }, [clearTimer, failClosed]);

  const html = useMemo(
    () =>
      TURNSTILE_SITEKEY
        ? buildHtml(TURNSTILE_SITEKEY, nonce)
        : "",
    [nonce]
  );

  // Keep refs and timers synchronized with the component lifecycle.
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearTimer();
      clearToken();
    };
  }, [clearTimer, clearToken]);

  // Start a fresh timeout for each challenge.
  useEffect(() => {
    if (!TURNSTILE_SITEKEY) {
      failClosed("error");
      return;
    }

    startTimer();

    return clearTimer;
  }, [nonce, startTimer, clearTimer, failClosed]);

  const retry = useCallback(() => {
    if (!TURNSTILE_SITEKEY) {
      failClosed("error");
      return;
    }

    clearToken();
    clearTimer();
    setStatus("loading");

    // A new nonce forces a fresh WebView document.
    setNonce(createNonce());
  }, [clearToken, clearTimer, failClosed]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMessage(
        event.nativeEvent.data,
        nonce
      );

      // Ignore malformed messages and stale documents.
      if (!message) return;

      clearTimer();

      if (message.kind === "expired") {
        failClosed("expired");
        return;
      }

      if (message.kind === "error") {
        console.error(
          "[Turnstile] Cloudflare reported a challenge error."
        );
        failClosed("error");
        return;
      }

      setStatus("ready");
      onTokenRef.current(message.token);
    },
    [nonce, clearTimer, failClosed]
  );

  return (
    <View style={styles.box}>
      {TURNSTILE_SITEKEY ? (
        <WebView
          key={nonce}
          source={{
            html,
            baseUrl: TURNSTILE_BASE_URL,
          }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          scrollEnabled={false}
          bounces={false}
          style={styles.web}
          onShouldStartLoadWithRequest={(request) => {
            try {
              const url = new URL(request.url);

              // Permit the blank initial WebKit document.
              if (url.protocol === "about:") {
                return true;
              }

              // Permit only HTTPS requests for the app origin
              // or Cloudflare's Turnstile origin.
              return (
                url.protocol === "https:" &&
                (
                  url.origin === CF_ORIGIN ||
                  url.origin ===
                    new URL(TURNSTILE_BASE_URL).origin
                )
              );
            } catch (error) {
              console.warn(
                "[Turnstile] Blocked an invalid navigation URL."
              );
              return false;
            }
          }}
          onMessage={handleMessage}
          onError={(event) => {
            console.error(
              "[Turnstile WebView error]",
              JSON.stringify(event.nativeEvent)
            );
            failClosed("error");
          }}
          onHttpError={(event) => {
            console.error(
              "[Turnstile HTTP error]",
              JSON.stringify(event.nativeEvent)
            );

            if (event.nativeEvent.statusCode >= 400) {
              failClosed("error");
            }
          }}
          onLoadProgress={({ nativeEvent }) => {
            console.log(
              "[Turnstile load progress]",
              nativeEvent.progress
            );
          }}
          onRenderProcessGone={(event) => {
            console.error(
              "[Turnstile renderer process exited]",
              JSON.stringify(event.nativeEvent)
            );
            failClosed("error");
          }}
          onContentProcessDidTerminate={() => {
            console.error(
              "[Turnstile] iOS WebView content process terminated."
            );
            failClosed("error");
          }}
        />
      ) : null}

      {status === "loading" && (
        <View
          style={styles.overlay}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={colors.iconTint} />
          <Text style={styles.loading}>Verifying…</Text>
        </View>
      )}

      {(status === "error" || status === "expired") && (
        <View
          style={styles.overlay}
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.errText}>
            {!TURNSTILE_SITEKEY
              ? "Security check is not configured."
              : status === "expired"
                ? "Security check expired."
                : "Security check unavailable."}
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
    height: 78,
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
