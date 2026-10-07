import { useEffect, useRef, useState } from "react";
import { useCallContext } from "../context/CallContext.jsx";
import { avatarImg } from "../utils/cloudinary";

// Same defence-in-depth as ChatWindow: never load an arbitrary host from socket data.
const MEDIA_HOSTS = [
  /([a-z0-9-]+\.)?cloudinary\.com$/i,
  /^media\.giphy\.com$/i,
  /^i\.giphy\.com$/i,
  /^media-0\.giphy\.com$/i,
  /^media\d*\.tenor\.com$/i,
  /([a-z0-9-]+\.)?tenor\.googleusercontent\.com$/i,
];
const isSafeUrl = (u) => {
  if (typeof u !== "string" || !u) return false;
  try {
    const p = new URL(u);
    return (
      (p.protocol === "https:" || p.protocol === "http:") &&
      MEDIA_HOSTS.some((r) => r.test(p.hostname))
    );
  } catch {
    return false;
  }
};

export default function InCallOverlay() {
  const call = useCallContext();
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const [sinkIds, setSinkIds] = useState([]);
  const [speakerOn, setSpeakerOn] = useState(true);

  const isVideo = call.mediaType === "video";

  // bind remote stream to EXACTLY ONE element by mode (kills the double-audio bug);
  // null the other so a mode flip can't leave two consumers of the same MediaStream.
  useEffect(() => {
    const v = remoteVideoRef.current,
      a = remoteAudioRef.current;
    if (isVideo) {
      if (v) {
        v.srcObject = call.remoteStream;
        v.play?.().catch(() => {});
      }
      if (a) a.srcObject = null;
    } else {
      if (a) {
        a.srcObject = call.remoteStream;
        a.play?.().catch(() => {});
      }
      if (v) v.srcObject = null;
    }
  }, [isVideo, call.remoteStream]);

  useEffect(() => {
    if (localVideoRef.current)
      localVideoRef.current.srcObject = call.localStream;
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

  const toggleSpeaker = async () => {
    if (!call.supportsSpeaker) return;
    const el = isVideo ? remoteVideoRef.current : remoteAudioRef.current; // the bound element
    if (!el || typeof el.setSinkId !== "function") return;
    const next = !speakerOn;
    try {
      await el.setSinkId(next ? sinkIds[0]?.deviceId || "default" : "default");
      setSpeakerOn(next);
    } catch {
      /* setSinkId can reject pre-permission */
    }
  };

  // Esc: reject while ringing, end while in call (stable deps -> no per-render resubscribe)
  const { phase, rejectCall, endCall } = call;
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (phase === "incoming") rejectCall();
        else endCall("hangup");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, rejectCall, endCall]);

  if (phase === "idle") return null;

  const ringing = phase === "incoming" || phase === "outgoing";
  const safePhoto = isSafeUrl(call.peer?.photo)
    ? avatarImg(call.peer.photo)
    : null;
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
            muted={false}
          />
        ) : (
          <div className="incall-audio-avatar" aria-hidden="true">
            {safePhoto ? (
              <img src={safePhoto} alt="" />
            ) : (
              <i className="bi bi-person-circle" />
            )}
          </div>
        )}
        {/* audio sink used in AUDIO mode (and as the setSinkId target); bound by the effect above */}
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          className="incall-hidden-audio"
        />

        {isVideo && call.localStream && (
          <video
            ref={localVideoRef}
            className="incall-pip"
            autoPlay
            playsInline
            muted
          />
        )}

        <div className="incall-info">
          <strong>{call.peer?.name || "Calling…"}</strong>
          <span>
            {statusText}
            {call.screenSharing ? " · sharing screen" : ""}
          </span>
        </div>
      </div>

      <div className="incall-controls">
        {ringing ? (
          phase === "incoming" ? (
            <>
              <button
                className="incall-btn incall-reject"
                onClick={rejectCall}
                aria-label="Decline"
              >
                <i className="bi bi-telephone-x-fill" />
              </button>
              <button
                className="incall-btn incall-accept"
                onClick={call.acceptCall}
                aria-label="Accept"
              >
                <i className="bi bi-telephone-fill" />
              </button>
            </>
          ) : (
            <button
              className="incall-btn incall-reject"
              onClick={() => endCall("hangup")}
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
                aria-label={call.videoOff ? "Camera on" : "Camera off"}
                aria-pressed={call.videoOff}
              >
                <i
                  className={`bi ${
                    call.videoOff
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
              onClick={() => endCall("hangup")}
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
