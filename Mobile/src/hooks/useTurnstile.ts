// src/hooks/useTurnstile.ts
// ADAPTER ONLY. This hook does NOT own the WebView, the sitekey, the challenge URL, or the
// postMessage/origin contract — those live, verified, in components/auth/TurnstileBox.tsx
// (sitekey from EXPO_PUBLIC_TURNSTILE_SITEKEY; source pinned to your own live
// https://mayamilan.vercel.app/mobile-turnstile.html). Re-implementing that contract here is
// exactly how a Turnstile integration silently becomes decorative, so we don't. This hook holds
// only the consumer-side state a screen needs and forces a SAFE re-challenge via React key-remount
// (universal; requires no imperative API from the component), which fixes the single-use-token
// replay lockout. Loud note for future maintainers: pairing this with <TurnstileBox/> is the
// contract; do NOT delete the component thinking the hook replaces it.
//
// Screen usage (RegisterScreen-style):
//   const { token, onToken, challengeKey, reset } = useTurnstile();
//   <TurnstileBox key={challengeKey} onToken={onToken} />
//   ...gate submit on !!token...
//   on any submit that CONSUMED the token and FAILED -> reset();
import { useCallback, useState } from "react";

export type TurnstileStatus = "idle" | "ready";

export interface UseTurnstile {
  /** Current single-use token ("" until the widget emits one). */
  token: string;
  /** Pass THIS as the component's onToken prop. */
  onToken: (t: string) => void;
  /** "idle" until a token arrives, then "ready". Widget-internal errors are owned by the
   *  component; this reflects only "do we have a token safe to send". */
  status: TurnstileStatus;
  /** Pass THIS as the component's React key. Bumping it remounts the WebView = a fresh
   *  challenge, with zero reliance on the component exposing reset() itself. */
  challengeKey: number;
  /** Clear the spent token AND force a re-challenge. Call whenever a submit that consumed
   *  the token fails, so the next attempt never replays a spent token. */
  reset: () => void;
}

export function useTurnstile(): UseTurnstile {
  const [token, setToken] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);

  const onToken = useCallback((t: string) => {
    // Defensive: expect a non-empty string; trim + type-guard so a malformed postMessage can
    // never set a "truthy but useless" token that passes a !!token gate then 400s server-side.
    setToken(typeof t === "string" ? t.trim() : "");
  }, []);

  const reset = useCallback(() => {
    setToken(""); // gate closes immediately
    setChallengeKey((k) => k + 1); // remount => brand-new single-use challenge
  }, []);

  const status: TurnstileStatus = token.length > 0 ? "ready" : "idle";
  return { token, onToken, status, challengeKey, reset };
}

export default useTurnstile;
