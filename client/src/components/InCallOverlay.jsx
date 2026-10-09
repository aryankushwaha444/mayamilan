import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCallContext } from "../context/CallContext.jsx";
import { avatarImg } from "../utils/cloudinary";
import {
  useIncomingCallSound,
  useOutgoingRingback,
  stopIncomingRingtone,
  stopOutgoingRingback,
} from "../utils/callSounds.js";

const ALLOW_HTTP_MEDIA = (() => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
})();

// ✅ CROSS-DEVICE: iOS Safari has no Chrome-style address-bar lock; the site grant
//    lives in the aA menu -> Website Settings, and the OS grant in Settings ->
//    Privacy & Security. Detect iOS so the panel tells the user the RIGHT control.
const IS_IOS = (() => {
  try {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const iosUA = /iP(hone|od|ad)/.test(ua);
    // iPadOS 13+ reports MacIntel with touch points
    const ipadOS =
      navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iosUA || ipadOS;
  } catch {
    return false;
  }
})();

const MEDIA_HOSTS = [
  /([a-z0-9-]+\.)?cloudinary\.com$/i,
  /^media\.giphy\.com$/i,
  /^i\.giphy\.com$/i,
  /^media-0\.giphy\.com$/i,
  /^media\d*\.tenor\.com$/i,
  /([a-z0-9-]+\.)?tenor\.googleusercontent\.com$/i,
];

// ✅ Built from char codes -> pure ASCII source, paste-proof (was the recurring
//    /[ -]/g corruption that mangled the peer name and failed to strip control chars).
const CONTROL_CHARS_RE = new RegExp(
  "[" +
    String.fromCharCode(0) +
    "-" +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    "]",
  "g"
);

const isSafeUrl = (u) => {
  if (typeof u !== "string" || !u) return false;
  try {
    const p = new URL(u);
    const allowedProtocol =
      p.protocol === "https:" || (ALLOW_HTTP_MEDIA && p.protocol === "http:");
    const noCredentials = !p.username && !p.password;
    return (
      allowedProtocol &&
      noCredentials &&
      MEDIA_HOSTS.some((r) => r.test(p.hostname))
    );
  } catch {
    return false;
  }
};

const safeImage = (raw) => {
  if (!isSafeUrl(raw)) return null;
  try {
    const t = avatarImg(raw);
    return isSafeUrl(t) ? t : null;
  } catch {
    return null;
  }
};

const safeText = (v, fallback = "") => {
  if (typeof v !== "string") return fallback;
  const c = v.replace(CONTROL_CHARS_RE, "").replace(/\s+/g, " ").trim();
  return c.slice(0, 80) || fallback;
};

let OVERLAY_MOUNT_COUNT = 0;

export default function InCallOverlay() {
  const call = useCallContext();

  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteOwnerRef = useRef(null);

  const [sinkIds, setSinkIds] = useState([]);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [mediaBlocked, setMediaBlocked] = useState(false);

  // 🔒 PERMISSION-FIX: the panel MODE/MESSAGE is now driven by call.permissionIssue.kind
  //    (a REAL probe from the hook), NOT by a second independent navigator.permissions
  //    query that could disagree with the actual mic state. So `micPerm` state is
  //    REMOVED entirely, and with it the `micPerm === "granted"` auto-resume effect
  //    that could thrash when site=granted but OS=blocked. Resume is now purely
  //    edge-triggered (onchange / focus / visibility / the button), each running the
  //    hook's real probe. permissions.query is kept ONLY to attach .onchange as a
  //    same-tab wake-up.
  const [hint, setHint] = useState(""); // transient feedback so a click is never silent
  const permStatusRef = useRef(null); // PermissionStatus, for .onchange wake-up
  const hintTimerRef = useRef(null);

  const isVideo = call.mediaType === "video";
  const isIncoming = call.phase === "incoming";
  const isOutgoing = call.phase === "outgoing";

  const remoteHasVideo = useMemo(
    () =>
      !!call.remoteStream &&
      typeof call.remoteStream.getVideoTracks === "function" &&
      call.remoteStream.getVideoTracks().length > 0,
    [call.remoteStream]
  );
  const showRemoteVideo = isVideo && remoteHasVideo;

  const { blocked: ringBlocked, enable: enableRingtone } =
    useIncomingCallSound(isIncoming);
  const { blocked: rbBlocked, enable: enableRingback } =
    useOutgoingRingback(isOutgoing);

  useEffect(() => {
    OVERLAY_MOUNT_COUNT += 1;
    if (import.meta.env?.DEV && OVERLAY_MOUNT_COUNT > 1) {
      console.error(
        `[InCallOverlay] ${OVERLAY_MOUNT_COUNT} overlay instances mounted simultaneously. ` +
          `The remote stream will play more than once and sound like an echo. ` +
          `Render <InCallOverlay/> in EXACTLY ONE place (grep your codebase for "<InCallOverlay").`
      );
    }
    return () => {
      OVERLAY_MOUNT_COUNT = Math.max(0, OVERLAY_MOUNT_COUNT - 1);
    };
  }, []);

  const bindRemote = useCallback(() => {
    const vEl = remoteVideoRef.current;
    const aEl = remoteAudioRef.current;
    const desiredOwner = showRemoteVideo ? "video" : "audio";
    const target = desiredOwner === "video" ? vEl : aEl;
    const other = desiredOwner === "video" ? aEl : vEl;
    if (
      import.meta.env?.DEV &&
      vEl &&
      aEl &&
      vEl.srcObject &&
      vEl.srcObject === aEl.srcObject
    ) {
      console.error(
        "[InCallOverlay] DOUBLE REMOTE PLAYBACK detected: same MediaStream on <video> and <audio>. Echo is software, not acoustic."
      );
    }
    try {
      if (other && other.srcObject) other.srcObject = null;
    } catch {}
    if (!target) {
      remoteOwnerRef.current = null;
      return;
    }
    if (
      remoteOwnerRef.current !== desiredOwner ||
      target.srcObject !== (call.remoteStream || null)
    ) {
      target.srcObject = call.remoteStream || null;
      remoteOwnerRef.current = call.remoteStream ? desiredOwner : null;
    }
    if (!call.remoteStream) {
      setMediaBlocked(false);
      return;
    }
    const p = target.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        try {
          target.muted = true;
          target.play().catch(() => {});
        } catch {}
        setMediaBlocked(true);
      });
    } else {
      setMediaBlocked(false);
    }
  }, [showRemoteVideo, call.remoteStream]);

  useEffect(() => {
    bindRemote();
  }, [bindRemote]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (import.meta.env?.DEV && !el.muted) {
      console.error(
        "[InCallOverlay] local preview is NOT muted -> your own voice could feed back. Keep muted on the local <video>."
      );
    }
    el.srcObject = call.localStream;
    el.muted = true;
    el.play?.().catch(() => {});
  }, [call.localStream]);

  useEffect(() => {
    if (
      !call.supportsSpeaker ||
      typeof navigator.mediaDevices?.enumerateDevices !== "function"
    )
      return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((ds) => {
        const outs = ds.filter((d) => d.kind === "audiooutput");
        setSinkIds(outs.length ? outs : [{ deviceId: "default" }]);
      })
      .catch(() => {});
  }, [call.supportsSpeaker, call.phase]);

  const showHint = useCallback((msg) => {
    setHint(msg);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(""), 6000);
  }, []);

  // 🔒 PERMISSION-FIX: ONE wake-up effect replaces the old three (query/micPerm mode,
  //    focus-only, granted-auto). When the panel is open we attach onchange (same-tab
  //    site grant) + focus/visibility (OS / other-tab / settings-page grant); every
  //    wake calls resolvePermission, which runs the hook's REAL getUserMedia probe.
  //    Granted -> panel clears + resumes. Not granted -> the hook re-arms with the
  //    accurate kind and this effect re-runs (edge-triggered, permBusy-guarded, so
  //    NO tight loop — the old micPerm==='granted' effect that could thrash is gone).
  //    On close we clear the stale hint + its timer (the "appeared without clicking"
  //    bleed) and detach onchange.
  useEffect(() => {
    if (!call.permissionIssue) {
      if (permStatusRef.current) {
        try {
          permStatusRef.current.onchange = null;
        } catch {}
        permStatusRef.current = null;
      }
      setHint("");
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
      return;
    }
    let alive = true;
    const wake = () => {
      if (!alive) return;
      void call.resolvePermission?.(); // real probe; self-guards + only resumes on grant
    };
    (async () => {
      let st = null;
      try {
        st =
          (await navigator.permissions?.query?.({ name: "microphone" })) ||
          null;
      } catch {}
      if (!alive) return;
      permStatusRef.current = st || null;
      if (st) st.onchange = wake; // any site-level change -> re-probe
    })();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      if (permStatusRef.current) {
        try {
          permStatusRef.current.onchange = null;
        } catch {}
      }
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [call.permissionIssue, call.resolvePermission]);

  useEffect(
    () => () => {
      try {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      } catch {}
      remoteOwnerRef.current = null;
      if (permStatusRef.current) {
        try {
          permStatusRef.current.onchange = null;
        } catch {}
      }
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      stopIncomingRingtone();
      stopOutgoingRingback();
    },
    []
  );

  const getRemoteEl = useCallback(
    () =>
      remoteOwnerRef.current === "video"
        ? remoteVideoRef.current
        : remoteAudioRef.current,
    []
  );

  const enableAllSound = useCallback(async () => {
    if (isIncoming) await enableRingtone();
    else if (isOutgoing) await enableRingback();
    const el = getRemoteEl();
    if (el) {
      el.muted = false;
      try {
        await el.play();
      } catch {}
    }
    setMediaBlocked(false);
  }, [isIncoming, isOutgoing, enableRingtone, enableRingback, getRemoteEl]);

  const toggleSpeaker = async () => {
    if (!call.supportsSpeaker) return;
    const el = getRemoteEl();
    if (!el || typeof el.setSinkId !== "function") return;
    const next = !speakerOn;
    try {
      await el.setSinkId(next ? sinkIds[0]?.deviceId || "default" : "default");
      setSpeakerOn(next);
    } catch {}
  };

  const onAccept = useCallback(async () => {
    stopIncomingRingtone();
    await call.acceptCall();
  }, [call]);
  const onReject = useCallback(() => {
    stopIncomingRingtone();
    call.rejectCall();
  }, [call]);
  const onEnd = useCallback(
    (reason = "hangup") => {
      stopIncomingRingtone();
      stopOutgoingRingback();
      call.endCall(reason);
    },
    [call]
  );

  const { phase, rejectCall, endCall } = call;
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        stopIncomingRingtone();
        stopOutgoingRingback();
        if (phase === "incoming") rejectCall();
        else endCall("hangup");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, rejectCall, endCall]);

  if (phase === "idle") return null;

  const ringing = isIncoming || isOutgoing;
  const safePhoto = safeImage(call.peer?.photo);
  const safeName = safeText(call.peer?.name, "Calling…");
  const mmss = `${String(Math.floor(call.durationSec / 60)).padStart(
    2,
    "0"
  )}:${String(call.durationSec % 60).padStart(2, "0")}`;

  let statusText;
  if (phase === "incoming") statusText = "Incoming call…";
  else if (phase === "outgoing") statusText = "Ringing…";
  else if (phase === "connecting") statusText = "Connecting…";
  else if (call.error) statusText = "Reconnecting…";
  else statusText = mmss;
  const remoteCamOff = isVideo && !remoteHasVideo && phase === "in-call";

  const showSoundButton = ringBlocked || rbBlocked || mediaBlocked;
  const hasLocalVideo =
    isVideo && call.localStream && call.localStream.getVideoTracks().length > 0;

  // ═══════════════════════════════════════════════════════════════════════
  // 🔒 PERMISSION PANEL — kind-driven (REAL probe), accurate per blocker AND per
  //    platform (iOS aA menu vs desktop lock icon), never shown when the mic
  //    actually works, never contradicts its own button, and resumes automatically
  //    the instant a real probe passes (onchange/focus/visibility/button).
  // ═══════════════════════════════════════════════════════════════════════
  if (call.permissionIssue) {
    const kind = call.permissionIssue.kind;
    const siteDenied = kind === "site-denied";
    const osBlocked = kind === "os-blocked";
    const blockedUnknown = kind === "blocked-unknown";
    const occupied = kind === "occupied";
    const noDevice = kind === "no-device";
    const prompting = kind === "prompt";
    const lockHelps = siteDenied || blockedUnknown; // address-bar/aA instruction is correct

    // ✅ platform-correct wording for the SITE grant control
    const siteControl = IS_IOS
      ? "the aA menu (left of the address bar) → Website Settings"
      : "the lock / camera icon in the address bar";
    const siteChip = IS_IOS ? "aA → Website Settings" : "🔒 address bar";

    const primaryDisabled = noDevice;
    const primaryLabel = noDevice
      ? "No microphone"
      : occupied
      ? "Try again"
      : prompting
      ? "Allow microphone"
      : osBlocked
      ? "I've enabled it — continue"
      : "I've allowed it — continue";

    const title = noDevice
      ? "No microphone found"
      : occupied
      ? "Microphone in use"
      : osBlocked
      ? "System is blocking the microphone"
      : siteDenied
      ? "Microphone is blocked"
      : prompting
      ? "Microphone permission needed"
      : "Microphone access needed";

    const body = noDevice
      ? "No microphone was found. Connect one (or use a device with a built-in mic), then try again."
      : occupied
      ? "Another app or browser tab is using the microphone. Close it, then press try again — the call connects automatically once it's free."
      : osBlocked
      ? "The site permission is already allowed, but your device or operating system is blocking the microphone for this browser — so the " +
        (IS_IOS ? "aA menu won't help" : "lock icon won't help") +
        ". Open your system privacy/microphone settings (" +
        (IS_IOS
          ? "iOS: Settings → Privacy & Security → Microphone"
          : "macOS: System Settings → Privacy & Security → Microphone; Windows: Settings → Privacy → Microphone") +
        ") and make sure this browser is allowed and a microphone is enabled. The call connects automatically once it is."
      : siteDenied
      ? "Your browser has blocked the microphone for this site, so it won't ask again automatically. Open " +
        siteControl +
        ", set Microphone to “Allow” — the call connects on its own the moment it's allowed. You can also press continue below after allowing."
      : prompting
      ? "Tap “Allow microphone” so Maya~Milan can hear you on this call."
      : blockedUnknown
      ? "We couldn't read the microphone permission for this browser. Try " +
        siteControl +
        " → Microphone → Allow, and also check your system microphone privacy settings. The call connects automatically once it's allowed."
      : "We couldn't access the microphone. Check " +
        (IS_IOS ? "the aA menu" : "the lock icon") +
        " and your system mic settings, then try again.";

    const cardStyle = {
      position: "fixed",
      inset: 0,
      zIndex: 2147483000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.72)",
      padding: 20,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    };
    const boxStyle = {
      width: "min(420px, 92vw)",
      background: "#fff",
      color: "#111",
      borderRadius: 16,
      padding: "22px 20px",
      boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
      textAlign: "center",
      maxHeight: "92vh",
      overflowY: "auto",
    };
    const titleStyle = { margin: "0 0 6px", fontSize: 18, fontWeight: 700 };
    const nameStyle = { margin: "0 0 14px", fontSize: 13, color: "#666" };
    const textStyle = {
      margin: "0 0 16px",
      fontSize: 14,
      lineHeight: 1.5,
      color: "#333",
    };
    const lockRowStyle = {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      margin: "0 0 16px",
      fontSize: 13,
      color: "#444",
      flexWrap: "wrap",
    };
    const chipStyle = {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 10px",
      border: "1px solid #ddd",
      borderRadius: 999,
      background: "#f6f6f6",
    };
    const btnRowStyle = {
      display: "flex",
      gap: 10,
      justifyContent: "center",
      flexWrap: "wrap",
    };
    const primaryStyle = {
      appearance: "none",
      border: "none",
      cursor: primaryDisabled ? "default" : "pointer",
      background: primaryDisabled ? "#bbb" : "#e91e63",
      color: "#fff",
      fontWeight: 700,
      fontSize: 15,
      padding: "12px 18px",
      borderRadius: 12,
      minWidth: 150,
    };
    const secondaryStyle = {
      appearance: "none",
      border: "1px solid #ddd",
      cursor: "pointer",
      background: "#fff",
      color: "#c0392b",
      fontWeight: 600,
      fontSize: 15,
      padding: "12px 16px",
      borderRadius: 12,
    };
    const hintStyle = {
      margin: "12px 0 0",
      fontSize: 13,
      lineHeight: 1.4,
      color: "#c0392b",
      minHeight: 18,
    };

    const onPrimary = async () => {
      if (primaryDisabled) return;
      const ok = await call.resolvePermission?.(); // REAL probe
      if (ok === true) return; // resumed; panel unmounts
      if (ok === undefined)
        showHint(
          "Permission UI isn't connected — hard‑refresh the page (Ctrl/Cmd + Shift + R)."
        );
      // 🔒 kind-independent + never contradicts the button: the (re-rendered) BODY
      // above already carries the precise, kind-correct steps; this line just points
      // there and reaffirms auto-connect. No stale "tap continue again" wording.
      else
        showHint(
          "Still blocked. Follow the steps above, then press continue — the call connects automatically once the microphone is allowed."
        );
    };

    return (
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Microphone permission"
      >
        <div style={boxStyle}>
          <p style={titleStyle}>{title}</p>
          <p style={nameStyle}>
            {safeName}
            {isVideo ? " · video call" : " · voice call"}
          </p>
          <p style={textStyle}>{body}</p>

          {lockHelps && (
            <div style={lockRowStyle} aria-hidden="true">
              <span style={chipStyle}>{siteChip}</span>
              <span>→</span>
              <span style={chipStyle}>
                Microphone: <b>Allow</b>
              </span>
              <span>→</span>
              <span style={chipStyle}>Allow ✓</span>
            </div>
          )}

          <div style={btnRowStyle}>
            <button
              type="button"
              style={primaryStyle}
              disabled={primaryDisabled}
              onClick={onPrimary}
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              style={secondaryStyle}
              onClick={() => {
                stopIncomingRingtone();
                stopOutgoingRingback();
                if (isIncoming) rejectCall();
                else endCall("hangup");
              }}
            >
              {isIncoming ? "Decline" : "Cancel"}
            </button>
          </div>

          {hint ? (
            <p style={hintStyle} role="alert" aria-live="assertive">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="incall-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Call"
    >
      <div className="incall-stage">
        {showRemoteVideo ? (
          <video
            ref={remoteVideoRef}
            className="incall-remote"
            autoPlay
            playsInline
            controls={false}
          />
        ) : (
          <div className="incall-audio-avatar" aria-hidden="true">
            {safePhoto ? (
              <img src={safePhoto} alt="" referrerPolicy="no-referrer" />
            ) : (
              <i className="bi bi-person-circle" />
            )}
          </div>
        )}

        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          controls={false}
          className="incall-hidden-audio"
        />

        {hasLocalVideo && (
          <video
            ref={localVideoRef}
            className="incall-pip"
            autoPlay
            playsInline
            controls={false}
            muted
          />
        )}

        <div className="incall-info">
          <strong>{safeName}</strong>
          <span aria-live="polite">
            {statusText}
            {remoteCamOff ? " · Their camera is off" : ""}
            {call.screenSharing ? " · sharing screen" : ""}
          </span>
        </div>

        {showSoundButton && (
          <button
            type="button"
            className="incall-enable-sound"
            onClick={enableAllSound}
            aria-label="Enable call sound"
          >
            <i className="bi bi-volume-up" aria-hidden="true" /> Tap to enable
            sound
          </button>
        )}
      </div>

      <div className="incall-controls">
        {ringing ? (
          phase === "incoming" ? (
            <>
              <button
                className="incall-btn incall-reject"
                onClick={onReject}
                aria-label="Decline"
              >
                <i className="bi bi-telephone-x-fill" />
              </button>
              <button
                className="incall-btn incall-accept"
                onClick={onAccept}
                aria-label="Accept"
              >
                <i className="bi bi-telephone-fill" />
              </button>
            </>
          ) : (
            <button
              className="incall-btn incall-reject"
              onClick={() => onEnd("hangup")}
              aria-label="Cancel"
            >
              <i className="bi bi-x-lg" />
            </button>
          )
        ) : (
          <>
            <button
              className={`incall-btn ${call.muted ? "active" : ""}`}
              onClick={call.toggleMute}
              aria-label={call.muted ? "Unmute" : "Mute"}
              aria-pressed={call.muted}
            >
              <i
                className={`bi ${
                  call.muted ? "bi-mic-mute-fill" : "bi-mic-fill"
                }`}
              />
            </button>
            {isVideo && (
              <button
                className={`incall-btn ${
                  call.cameraUnavailable || call.videoOff ? "active" : ""
                }`}
                onClick={call.toggleVideo}
                aria-label={
                  call.cameraUnavailable
                    ? "Enable camera (retry)"
                    : call.videoOff
                    ? "Turn camera on"
                    : "Turn camera off"
                }
                aria-pressed={call.cameraUnavailable || call.videoOff}
                title={
                  call.cameraUnavailable
                    ? "No camera feed yet — tap to enable / retry"
                    : undefined
                }
              >
                <i
                  className={`bi ${
                    call.cameraUnavailable || call.videoOff
                      ? "bi-camera-video-off-fill"
                      : "bi-camera-video-fill"
                  }`}
                />
              </button>
            )}
            {isVideo && (
              <button
                className="incall-btn"
                onClick={call.switchCamera}
                aria-label="Switch camera"
              >
                <i className="bi bi-arrow-repeat" />
              </button>
            )}
            {call.supportsScreenShare && (
              <button
                className={`incall-btn ${call.screenSharing ? "active" : ""}`}
                onClick={call.toggleScreenShare}
                aria-label="Share screen"
                aria-pressed={call.screenSharing}
              >
                <i className="bi bi-display" />
              </button>
            )}
            {call.supportsSpeaker && (
              <button
                className={`incall-btn ${!speakerOn ? "active" : ""}`}
                onClick={toggleSpeaker}
                aria-label="Speaker"
                aria-pressed={speakerOn}
              >
                <i
                  className={`bi ${
                    speakerOn ? "bi-volume-up-fill" : "bi-volume-mute-fill"
                  }`}
                />
              </button>
            )}
            <button
              className="incall-btn incall-end"
              onClick={() => onEnd("hangup")}
              aria-label="End call"
            >
              <i className="bi bi-telephone-x-fill" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
