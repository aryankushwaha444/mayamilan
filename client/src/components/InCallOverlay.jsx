import { useCallback, useEffect, useRef, useState } from "react";
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

export default function InCallOverlay() {
  const call = useCallContext();

  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);

  const [sinkIds, setSinkIds] = useState([]);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [mediaBlocked, setMediaBlocked] = useState(false);

  const isVideo = call.mediaType === "video";
  const isIncoming = call.phase === "incoming";
  const isOutgoing = call.phase === "outgoing";

  const { blocked: ringBlocked, enable: enableRingtone } =
    useIncomingCallSound(isIncoming);
  const { blocked: rbBlocked, enable: enableRingback } =
    useOutgoingRingback(isOutgoing);

  const bindRemote = useCallback(() => {
    const el = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
    if (!el) return;
    el.srcObject = call.remoteStream || null;
    if (!call.remoteStream) {
      setMediaBlocked(false);
      return;
    }
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        if (isVideo) {
          el.muted = true;
          el.play().catch(() => {});
        }
        setMediaBlocked(true);
      });
    } else {
      setMediaBlocked(false);
    }
  }, [isVideo, call.remoteStream]);

  useEffect(() => {
    bindRemote();
  }, [bindRemote]);

  useEffect(() => {
    const v = remoteVideoRef.current,
      a = remoteAudioRef.current;
    if (isVideo) {
      if (a) a.srcObject = null;
    } else {
      if (v) v.srcObject = null;
    }
  }, [isVideo]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = call.localStream;
      localVideoRef.current.play?.().catch(() => {});
    }
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
  }, [call.supportsSpeaker]);

  useEffect(
    () => () => {
      try {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
      } catch {}
      stopIncomingRingtone();
      stopOutgoingRingback();
    },
    []
  );

  const enableAllSound = useCallback(async () => {
    if (isIncoming) await enableRingtone();
    else if (isOutgoing) await enableRingback();
    const el = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
    if (el) {
      el.muted = false;
      try {
        await el.play();
      } catch {}
    }
    setMediaBlocked(false);
  }, [isIncoming, isOutgoing, enableRingtone, enableRingback, isVideo]);

  const toggleSpeaker = async () => {
    if (!call.supportsSpeaker) return;
    const el = isVideo ? remoteVideoRef.current : remoteAudioRef.current;
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
  const statusText =
    phase === "incoming"
      ? "Incoming call…"
      : phase === "outgoing"
      ? "Ringing…"
      : phase === "connecting"
      ? "Connecting…"
      : call.error
      ? "Reconnecting…"
      : mmss;

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
        {isVideo ? (
          <video
            ref={remoteVideoRef}
            className="incall-remote"
            autoPlay
            playsInline
            controls={false}
            muted={false}
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
                className={`incall-btn ${call.videoOff ? "active" : ""}`}
                onClick={call.toggleVideo}
                disabled={call.cameraUnavailable}
                aria-label={
                  call.cameraUnavailable
                    ? "Camera unavailable"
                    : call.videoOff
                    ? "Camera on"
                    : "Camera off"
                }
                aria-pressed={call.videoOff}
                title={
                  call.cameraUnavailable
                    ? "Another app or tab is using the camera"
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
                disabled={call.cameraUnavailable}
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
