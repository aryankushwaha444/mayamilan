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

const MEDIA_HOSTS = [
  /([a-z0-9-]+\.)?cloudinary\.com$/i,
  /^media\.giphy\.com$/i,
  /^i\.giphy\.com$/i,
  /^media-0\.giphy\.com$/i,
  /^media\d*\.tenor\.com$/i,
  /([a-z0-9-]+\.)?tenor\.googleusercontent\.com$/i,
];

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

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
  }, [call.supportsSpeaker, call.phase]); // ✅ re-enumerate when a call connects so speaker labels populate

  useEffect(
    () => () => {
      try {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      } catch {}
      remoteOwnerRef.current = null;
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

  // ✅ DEFECT 1+2 FIX: 'connecting' must read "Connecting…" (NOT a premature
  //    "camera off"); the timer must show whenever we are in-call; "camera off"
  //    is only an appendix, and only once truly connected with no remote video.
  let statusText;
  if (phase === "incoming") statusText = "Incoming call…";
  else if (phase === "outgoing") statusText = "Ringing…";
  else if (phase === "connecting") statusText = "Connecting…";
  else if (call.error) statusText = "Reconnecting…";
  else statusText = mmss; // in-call -> timer always visible, never hidden by the note
  const remoteCamOff = isVideo && !remoteHasVideo && phase === "in-call";

  const showSoundButton = ringBlocked || rbBlocked || mediaBlocked;
  const hasLocalVideo =
    isVideo && call.localStream && call.localStream.getVideoTracks().length > 0;

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
              // ✅ DEFECT 4 FIX: never disable the camera button. When there is no
              //    live track (degraded/dead) the click RE-ACQUIRES via toggleVideo's
              //    retry path; when a live track exists it just toggles enabled.
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
