import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./useSocket.js";
import { useAlert } from "../context/AlertContext";

import {
  getDefaultPreset,
  getMediaConstraints,
  createHighQualityPeerConnection,
  bindQualityToPeerConnection,
  applyAllSendersQuality,
  applyVideoSenderQuality,
  preferVideoCodec,
  logLocalMediaSettings,
  startWebRtcStatsMonitor,
  buildProcessedAudioTrack, // ✅ mic denoiser factory
  requestMediaPermission, // ✅ permission pre-flight (no auto-end on denial)
} from "../utils/videoQuality.js";

import {
  sanitizeIceServers,
  sanitizeIceCandidate,
  sanitizeSdp,
  sanitizePeer,
  sanitizeCallId,
  sanitizeErrorMessage,
  isWebRtcDebugEnabled,
  MAX_PENDING_CANDIDATES,
} from "../utils/webrtcSecurity.js";

const SUPPORTS_SETSINKID =
  typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
const SUPPORTS_DISPLAYMEDIA =
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

const ICE_DISCONNECT_GRACE_MS = 8000;
const OUTGOING_NO_ANSWER_MS = 30000;
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

// Map a terminal transition -> a chat-log status the UI understands.
const mapEndedStatus = (payload) => {
  const st = String(payload?.status || "").toLowerCase();
  const rs = String(payload?.reason || "").toLowerCase();
  if (st === "missed" || rs === "no-answer" || rs === "no_answer")
    return "no-answer";
  if (rs === "offline" || rs === "unreachable" || st === "unreachable")
    return "unreachable";
  if (rs === "busy" || st === "busy") return "busy";
  if (rs === "blocked") return "blocked";
  return "ended";
};
const mapRejectedStatus = (reason) => {
  const r = String(reason || "").toLowerCase();
  if (r === "busy") return "busy";
  if (r === "offline" || r === "unreachable") return "unreachable";
  return "declined";
};

// ✅ Actionable text for a blocked/absent mic. A *blocked* site permission will
// NOT re-prompt, so a blind "retry" is useless — we must show the 🔒/camera-icon
// -> Allow instructions. (Pure string builder; touches no call state.)
function permMessage(perm, mt) {
  if (perm.mic === "no-device")
    return "No microphone found. Connect a mic (or use a device with one), then try again.";
  if (perm.mic === "error")
    return "Couldn't access the microphone. Check browser permissions and that the site is HTTPS, then try again.";
  const parts = ["Microphone"];
  if (mt === "video" && perm.cam === "denied") parts.push("Camera");
  return `${parts.join(
    " and "
  )} access is blocked. Tap the 🔒 / camera icon in your browser's address bar, set ${parts.join(
    " and "
  )} to “Allow”, then tap Call / Accept again.`;
}

export function useCall() {
  const { socket } = useSocket();
  const toast = useAlert();

  const [phase, setPhase] = useState("idle");
  const [callId, setCallId] = useState(null);
  const [peer, setPeer] = useState(null);
  const [mediaType, setMediaType] = useState("audio");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false); // USER intent
  const [cameraUnavailable, setCameraUnavailable] = useState(false); // SYSTEM
  const [screenSharing, setScreenSharing] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteTracksRef = useRef(new Set());
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const videoSenderRef = useRef(null);
  const audioSenderRef = useRef(null); // ✅ the audio RTCRtpSender
  const audioOutTrackRef = useRef(null); // ✅ the track actually transmitted (cleaned or raw)
  const audioDisposeRef = useRef(null); // ✅ denoiser teardown
  const pendingCandidatesRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const durationTimerRef = useRef(null);
  const iceDisconnectTimerRef = useRef(null);
  const noAnswerTimerRef = useRef(null);
  const iceServersRef = useRef([]);
  const phaseRef = useRef("idle");
  const callIdRef = useRef(null);
  const mediaTypeRef = useRef("audio");

  // call-log bookkeeping
  const peerIdRef = useRef(null);
  const connectedAtRef = useRef(null);
  const loggedRef = useRef(false);

  const presetRef = useRef(getDefaultPreset());
  const qualityStopRef = useRef(null);
  const statsStopRef = useRef(null);
  const isMountedRef = useRef(true);
  const socketRef = useRef(socket);
  const teardownRef = useRef(null);
  const permBusyRef = useRef(false); // ✅ double-tap guard while a prompt is open

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const setPhaseSafe = (p) => {
    phaseRef.current = p;
    if (isMountedRef.current) setPhase(p);
  };

  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);
  useEffect(() => {
    mediaTypeRef.current = mediaType;
  }, [mediaType]);

  const clearDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };
  const clearIceDisconnectTimer = () => {
    if (iceDisconnectTimerRef.current) {
      clearTimeout(iceDisconnectTimerRef.current);
      iceDisconnectTimerRef.current = null;
    }
  };
  const clearNoAnswerTimer = () => {
    if (noAnswerTimerRef.current) {
      clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }
  };
  const clearQualityBindings = () => {
    try {
      qualityStopRef.current?.();
    } catch {}
    try {
      statsStopRef.current?.();
    } catch {}
    qualityStopRef.current = null;
    statsStopRef.current = null;
  };

  const publishRemote = useCallback(() => {
    const tracks = Array.from(remoteTracksRef.current);
    if (tracks.length === 0) {
      if (isMountedRef.current) setRemoteStream(null);
      return;
    }
    const ms = new MediaStream(tracks);
    if (isMountedRef.current) setRemoteStream(ms);
  }, []);

  const finalizeCall = useCallback((status, durationOverrideMs) => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    try {
      const peerId = peerIdRef.current || callIdRef.current || null;
      if (!peerId) return;
      const connectedMs = connectedAtRef.current
        ? Date.now() - connectedAtRef.current
        : 0;
      const dur =
        Number.isFinite(+durationOverrideMs) && +durationOverrideMs > 0
          ? Math.min(+durationOverrideMs, 24 * 60 * 60 * 1000)
          : connectedMs;
      const detail = {
        callId: callIdRef.current || null,
        peerId: String(peerId),
        mediaType: mediaTypeRef.current === "video" ? "video" : "audio",
        status: String(status || "ended")
          .slice(0, 40)
          .toLowerCase(),
        durationMs:
          status === "ended" ||
          status === "completed" ||
          status === "answered" ||
          status === "connected"
            ? dur
            : 0,
        at: Date.now(),
      };
      window.dispatchEvent(new CustomEvent("call:logged", { detail }));
    } catch {}
  }, []);

  const resetCallLog = useCallback((peerId) => {
    loggedRef.current = false;
    connectedAtRef.current = null;
    peerIdRef.current = peerId || null;
  }, []);

  const teardown = useCallback(() => {
    clearDurationTimer();
    clearIceDisconnectTimer();
    clearNoAnswerTimer();
    clearQualityBindings();

    // ✅ release the denoiser (stops cleaned track + closes AudioContext) BEFORE
    // we stop the raw mic / close the pc, so the audio thread is freed promptly.
    try {
      audioDisposeRef.current?.();
    } catch {}
    audioDisposeRef.current = null;
    audioOutTrackRef.current = null;
    audioSenderRef.current = null;

    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    iceServersRef.current = [];
    remoteTracksRef.current = new Set();

    if (pcRef.current) {
      try {
        pcRef.current._abort?.abort();
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (cameraTrackRef.current) {
      try {
        cameraTrackRef.current.__mayaAc?.abort();
      } catch {}
    }
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      localStreamRef.current = null;
    }
    if (screenTrackRef.current) {
      try {
        screenTrackRef.current.stop();
      } catch {}
      screenTrackRef.current = null;
    }
    cameraTrackRef.current = null;
    videoSenderRef.current = null;

    if (isMountedRef.current) {
      setLocalStream(null);
      setRemoteStream(null);
      setMuted(false);
      setVideoOff(false);
      setCameraUnavailable(false);
      setScreenSharing(false);
      setDurationSec(0);
      setCallId(null);
      setPeer(null);
      setError(null);
    }
    setPhaseSafe("idle");
  }, []);

  useEffect(() => {
    teardownRef.current = teardown;
  }, [teardown]);

  const bindCameraListeners = useCallback((track) => {
    if (!track) return;
    const ac = new AbortController();
    track.__mayaAc = ac;
    const onMute = () => {
      if (isMountedRef.current) setCameraUnavailable(true);
    };
    const onUnmute = () => {
      if (isMountedRef.current) setCameraUnavailable(false);
    };
    track.addEventListener("mute", onMute, { signal: ac.signal });
    track.addEventListener("unmute", onUnmute, { signal: ac.signal });
  }, []);
  const unbindCameraListeners = useCallback((track) => {
    try {
      track?.__mayaAc?.abort();
    } catch {}
  }, []);

  const buildPc = useCallback(
    (iceServers) => {
      clearQualityBindings();
      const safeServers = sanitizeIceServers(iceServers);
      const pc = createHighQualityPeerConnection(safeServers);
      pcRef.current = pc;
      pc._callId = null;
      pc._peerId = null;
      pc._abort = new AbortController();

      try {
        qualityStopRef.current = bindQualityToPeerConnection(
          pc,
          presetRef.current
        );
      } catch {}
      if (isWebRtcDebugEnabled()) {
        try {
          statsStopRef.current = startWebRtcStatsMonitor(pc, 3000);
        } catch {}
      }

      pc.onicecandidate = (e) => {
        if (!e.candidate || !socketRef.current || !pc._callId || !pc._peerId)
          return;
        try {
          socketRef.current.emit("call:signal", {
            callId: pc._callId,
            to: pc._peerId,
            candidate: e.candidate.toJSON(),
          });
        } catch {}
      };

      pc.ontrack = (e) => {
        if (!e.track) return;
        remoteTracksRef.current.add(e.track);
        e.track.addEventListener(
          "ended",
          () => {
            remoteTracksRef.current.delete(e.track);
            publishRemote();
          },
          { once: true, signal: pc._abort.signal }
        );
        publishRemote();
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") {
          clearIceDisconnectTimer();
          clearNoAnswerTimer();
          if (!connectedAtRef.current) connectedAtRef.current = Date.now();
          setPhaseSafe("in-call");
          try {
            socketRef.current?.emit("call:connected", { callId: pc._callId });
          } catch {}
          clearDurationTimer();
          const start = Date.now();
          durationTimerRef.current = setInterval(() => {
            if (isMountedRef.current)
              setDurationSec(Math.floor((Date.now() - start) / 1000));
          }, 1000);
        } else if (st === "failed") {
          if (isMountedRef.current) setError("Connection failed");
          try {
            socketRef.current?.emit("call:end", {
              callId: pc._callId,
              reason: "error",
            });
          } catch {}
          finalizeCall("failed");
          teardown();
        } else if (st === "disconnected") {
          clearIceDisconnectTimer();
          iceDisconnectTimerRef.current = setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState !== "connected") {
              try {
                socketRef.current?.emit("call:end", {
                  callId: pc._callId,
                  reason: "error",
                });
              } catch {}
              finalizeCall("failed");
              teardown();
            }
          }, ICE_DISCONNECT_GRACE_MS);
        }
      };

      return pc;
    },
    [teardown, publishRemote, finalizeCall]
  );

  const flushPendingCandidates = useCallback(async (pc) => {
    const list = pendingCandidatesRef.current.splice(0, MAX_PENDING_CANDIDATES);
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
    pendingCandidatesRef.current = [];
  }, []);

  // ✅ acquireLocal is now the SINGLE place the camera is opened (the pre-flight
  //    is mic-only), so there is no open->stop->open race that could hand us a
  //    muted/ended track. It also CLASSIFIES the camera-open failure so the
  //    degrade toast is actionable (blocked vs busy vs none) instead of vague,
  //    and it does NOT install a permanent lock (the camera button stays usable
  //    for the toggleVideo retry below).
  const acquireLocal = useCallback(
    async (mt) => {
      const preset = presetRef.current;
      const base = getMediaConstraints(preset);
      const audioOnly = { audio: base.audio, video: false };
      let stream = null;
      let degraded = false;
      let camFail = null; // ✅ capture the camera-open error name for messaging
      if (mt === "video") {
        try {
          stream = await navigator.mediaDevices.getUserMedia(base); // ✅ the ONLY camera open
          if (!stream.getVideoTracks().length) {
            try {
              stream.getTracks().forEach((t) => {
                try {
                  t.stop();
                } catch {}
              });
            } catch {}
            stream = null;
          }
        } catch (e) {
          camFail = e?.name || "error";
          stream = null;
        }
        if (!stream) {
          degraded = true;
          stream = await navigator.mediaDevices.getUserMedia(audioOnly);
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia(audioOnly);
      }
      localStreamRef.current = stream;
      if (isMountedRef.current) setLocalStream(stream);
      const v = stream.getVideoTracks()[0] || null;
      cameraTrackRef.current = v;
      bindCameraListeners(v);
      if (degraded && isMountedRef.current) {
        setCameraUnavailable(true); // state for icon/aria; the overlay no longer disables the button
        const msg =
          camFail === "NotAllowedError" || camFail === "SecurityError"
            ? "Camera blocked — tap the 🔒 / camera icon in the address bar, set Camera to “Allow”, then tap the camera button to join with video."
            : camFail === "NotReadableError"
            ? "Camera busy — another tab/app/device is using it. Continuing audio-only; free the camera and tap the camera button to add video."
            : "No camera available on this device. Continuing with audio only.";
        toastRef.current?.warning?.(msg, "Call", 6000);
      }
      if (isWebRtcDebugEnabled()) await logLocalMediaSettings(stream);
      return stream;
    },
    [bindCameraListeners]
  );

  // ✅ Swap the raw mic for the denoised track on the audio sender. Fire-and-forget:
  //    negotiation already happened with the raw track, so replaceTrack mid-call is
  //    exactly like the camera/screen swap (no renegotiation). On ANY failure the
  //    raw track stays in place (browser NS only) -> never breaks the call.
  const applyNoiseSuppression = useCallback(async () => {
    try {
      const sender = audioSenderRef.current;

      const raw =
        sender?.track || localStreamRef.current?.getAudioTracks?.()[0] || null;

      if (!sender || !raw || raw.kind !== "audio") return;

      // Do not rebuild an already processed track.
      if (audioOutTrackRef.current === sender.track) {
        return;
      }

      const built = await buildProcessedAudioTrack(raw);

      if (!built?.track || typeof built.dispose !== "function") {
        return;
      }

      // Prevent a race with call teardown / sender replacement.
      if (
        audioSenderRef.current !== sender ||
        pcRef.current == null ||
        sender.track !== raw
      ) {
        try {
          built.dispose();
        } catch {}

        return;
      }

      const previousDispose = audioDisposeRef.current;

      try {
        await sender.replaceTrack(built.track);
      } catch {
        try {
          built.dispose();
        } catch {}

        return;
      }

      // Only dispose the previous processor AFTER
      // the new track has successfully replaced it.
      if (previousDispose && previousDispose !== built.dispose) {
        try {
          previousDispose();
        } catch {}
      }

      audioOutTrackRef.current = built.track;
      audioDisposeRef.current = built.dispose;

      try {
        built.track.addEventListener(
          "ended",
          () => {
            if (audioOutTrackRef.current === built.track) {
              audioOutTrackRef.current = null;
            }

            if (audioDisposeRef.current === built.dispose) {
              audioDisposeRef.current = null;
            }
          },
          { once: true }
        );
      } catch {}

      if (isWebRtcDebugEnabled()) {
        console.log("🎚 microphone noise suppression engaged");
      }
    } catch (e) {
      if (isWebRtcDebugEnabled()) {
        console.warn(
          "noise suppression skipped (raw/browser NS remains active):",
          e?.message || e
        );
      }
    }
  }, []);

  const attachLocalToPc = useCallback(
    (pc, stream) => {
      if (!pc || !stream) return;
      const preset = presetRef.current;
      stream.getTracks().forEach((track) => {
        try {
          if (typeof pc.addTransceiver === "function") {
            const transceiver = pc.addTransceiver(track, {
              direction: "sendrecv",
              streams: [stream],
            });
            if (track.kind === "video") {
              preferVideoCodec(transceiver, "compatible");
              videoSenderRef.current = transceiver.sender;
            } else if (track.kind === "audio") {
              audioSenderRef.current = transceiver.sender; // ✅ remember audio sender
            }
          } else {
            const sender = pc.addTrack(track, stream);
            if (track.kind === "video") videoSenderRef.current = sender;
            else if (track.kind === "audio") audioSenderRef.current = sender; // ✅
          }
        } catch (err) {
          if (isWebRtcDebugEnabled())
            console.warn("attachLocalToPc track failed:", err?.message || err);
        }
      });
      const hasVideoSender = pc
        .getSenders()
        .some((s) => s.track?.kind === "video");
      if (!hasVideoSender && typeof pc.addTransceiver === "function") {
        try {
          pc.addTransceiver("video", { direction: "recvonly" });
        } catch {}
      }
      applyAllSendersQuality(pc, preset).catch(() => {});
      void applyNoiseSuppression(); // ✅ engage denoiser after senders exist
    },
    [applyNoiseSuppression]
  );

  // ✅ Caller: ask permission BEFORE ringing anyone. Denial => the call is never
  //    started (nothing to end); the no-answer countdown starts only after a
  //    grant, so a slow answer can't time the call out mid-prompt. All inbound
  //    ids still sanitized; phase re-checked after the await (race guard).
  const startCall = useCallback(
    async (to, mt, conversationId) => {
      if (phaseRef.current !== "idle" || !socketRef.current) return;
      if (mt !== "audio" && mt !== "video") return;
      if (permBusyRef.current) return; // a prompt is already open
      const safeTo = sanitizeCallId(to);
      if (!safeTo) return;
      const safeConv = conversationId
        ? sanitizeCallId(conversationId)
        : undefined;

      permBusyRef.current = true;
      let perm;
      try {
        perm = await requestMediaPermission(mt);
      } finally {
        permBusyRef.current = false;
      }
      // re-check after the await: they may have navigated away mid-prompt
      if (phaseRef.current !== "idle" || !socketRef.current) return;
      if (perm.mic !== "granted") {
        // ✅ NOT an end — the call was never started. Clear, actionable message.
        toastRef.current?.error?.(
          permMessage(perm, mt),
          "Permission needed",
          6000
        );
        return;
      }

      resetCallLog(safeTo);
      setMediaType(mt);
      setPhaseSafe("outgoing");
      setPeer(
        sanitizePeer({ _id: safeTo }) || {
          _id: safeTo,
          name: null,
          photo: null,
        }
      );

      try {
        socketRef.current.emit("call:start", {
          to: safeTo,
          mediaType: mt,
          conversationId: safeConv,
        });
      } catch {
        finalizeCall("failed");
        teardown();
        return;
      }

      // timer starts only now (post-permission), so it can never overlap the prompt
      clearNoAnswerTimer();
      noAnswerTimerRef.current = setTimeout(() => {
        if (phaseRef.current !== "outgoing") return;
        if (callIdRef.current) {
          try {
            socketRef.current?.emit("call:end", {
              callId: callIdRef.current,
              reason: "no-answer",
            });
          } catch {}
        }
        if (isMountedRef.current)
          toastRef.current?.info?.("No answer", "Call", 3000);
        finalizeCall("no-answer");
        teardown();
      }, OUTGOING_NO_ANSWER_MS);
    },
    [teardown, resetCallLog, finalizeCall]
  );

  // ✅ Callee: ask permission while phase is STILL "incoming" (we have NOT set
  //    "connecting" and have NOT emitted anything to the caller). Granted ->
  //    connect normally. Denied -> stay "incoming"; Accept/Decline remain visible
  //    (that IS the retry); we do NOT reject and do NOT tear down. Only a genuine
  //    non-permission failure ends the call.
  const acceptCall = useCallback(async () => {
    if (
      phaseRef.current !== "incoming" ||
      !callIdRef.current ||
      !socketRef.current
    )
      return;
    const id = callIdRef.current;
    const peerId = peer?._id || peerIdRef.current;
    if (!peerId) {
      // corrupted (no peer id) -> ending is correct here, not a permission case
      try {
        socketRef.current.emit("call:reject", {
          callId: id,
          reason: "declined",
        });
      } catch {}
      finalizeCall("declined");
      teardown();
      return;
    }
    if (permBusyRef.current) return; // double-tap guard while a prompt is open

    permBusyRef.current = true;
    let perm;
    try {
      perm = await requestMediaPermission(mediaTypeRef.current);
    } finally {
      permBusyRef.current = false;
    }
    if (phaseRef.current !== "incoming") return; // declined/hung-up during prompt
    if (perm.mic !== "granted") {
      toastRef.current?.error?.(
        permMessage(perm, mediaTypeRef.current),
        "Permission needed",
        6000
      );
      setError(
        perm.mic === "no-device" ? "No microphone" : "Microphone/camera blocked"
      );
      return; // stay incoming -> user can retry (re-prompt) or Decline. No auto-end.
    }

    try {
      setError(null);
      setPhaseSafe("connecting");
      const stream = await acquireLocal(mediaTypeRef.current); // instant: already granted
      const pc = pcRef.current || buildPc(iceServersRef.current || []);
      pc._callId = id;
      pc._peerId = peerId;
      peerIdRef.current = peerId;
      attachLocalToPc(pc, stream);
      try {
        socketRef.current.emit("call:accept", { callId: id });
      } catch {
        finalizeCall("failed");
        teardown();
      }
    } catch (e) {
      const name = e?.name;
      if (name === "NotAllowedError" || name === "NotFoundError") {
        // shouldn't happen post-gate, but if permission vanished mid-step, do NOT
        // auto-reject: revert to incoming + actionable message (same policy above).
        toastRef.current?.error?.(
          permMessage({ mic: "denied", cam: null }, mediaTypeRef.current),
          "Permission needed",
          6000
        );
        setPhaseSafe("incoming");
        return;
      }
      if (isMountedRef.current)
        toastRef.current?.error?.("Could not start call", "Call", 4000);
      try {
        socketRef.current.emit("call:reject", {
          callId: id,
          reason: "declined",
        });
      } catch {}
      finalizeCall("failed");
      teardown();
    }
  }, [peer, acquireLocal, buildPc, attachLocalToPc, teardown, finalizeCall]);

  const rejectCall = useCallback(() => {
    if (
      phaseRef.current !== "incoming" ||
      !callIdRef.current ||
      !socketRef.current
    )
      return;
    try {
      socketRef.current.emit("call:reject", {
        callId: callIdRef.current,
        reason: "declined",
      });
    } catch {}
    finalizeCall("declined");
    teardown();
  }, [teardown, finalizeCall]);

  const endCall = useCallback(
    (reason = "hangup") => {
      if (!socketRef.current) {
        finalizeCall(connectedAtRef.current ? "ended" : "canceled");
        teardown();
        return;
      }
      const safeReason =
        typeof reason === "string"
          ? reason.replace(CONTROL_CHARS_RE, "").slice(0, 40)
          : "hangup";
      if (callIdRef.current) {
        try {
          socketRef.current.emit("call:end", {
            callId: callIdRef.current,
            reason: safeReason,
          });
        } catch {}
      }
      const st =
        safeReason === "no-answer"
          ? "no-answer"
          : connectedAtRef.current
          ? "ended"
          : "canceled";
      finalizeCall(st);
      teardown();
    },
    [teardown, finalizeCall]
  );

  // ✅ Mute the track that is ACTUALLY transmitted (the cleaned one after the
  //    swap), not the raw mic — otherwise muting silently stops working once
  //    the denoiser replaces the sender track. Falls back to raw if no swap.
  const toggleMute = useCallback(() => {
    const next = !muted;
    const out = audioOutTrackRef.current;
    if (out && out.readyState !== "ended") {
      out.enabled = !next;
    } else {
      localStreamRef.current
        ?.getAudioTracks()
        .forEach((t) => (t.enabled = !next));
    }
    if (isMountedRef.current) setMuted(next);
  }, [muted]);

  // ✅ Camera button = toggle when a live track exists, RETRY (re-acquire +
  //    replaceTrack) when it doesn't. replaceTrack needs NO renegotiation, so
  //    recovery is safe mid-call. If the call connected with no video SEND slot
  //    (pure-audio degrade) we cannot add one without renegotiation, so we stop
  //    the new track and tell the user to redial (honest, never a silent one-way).
  //    (Signature unchanged; now async so it can await getUserMedia/replaceTrack —
  //    an onClick handler ignores the returned Promise, so call sites don't move.)
  const toggleVideo = useCallback(async () => {
    if (phaseRef.current === "idle" || phaseRef.current === "incoming") return; // no call to attach video to
    const t = cameraTrackRef.current;
    if (t && t.readyState === "live") {
      const next = !videoOff;
      t.enabled = !next;
      if (isMountedRef.current) setVideoOff(next);
      return;
    }
    if (permBusyRef.current) return;
    permBusyRef.current = true;
    try {
      const preset = presetRef.current;
      const base = getMediaConstraints(preset);
      const ns = await navigator.mediaDevices.getUserMedia({
        video: base.video,
        audio: false,
      });
      const nt = ns.getVideoTracks()[0];
      if (!nt) throw new Error("no video track");
      try {
        if ("contentHint" in nt)
          nt.contentHint = preset.contentHint || "motion";
      } catch {}
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(nt); // ✅ no renegotiation
        await applyVideoSenderQuality(videoSenderRef.current, preset).catch(
          () => {}
        );
      } else {
        try {
          nt.stop();
        } catch {}
        if (isMountedRef.current)
          toastRef.current?.error?.(
            "Camera was off when this call connected. Hang up and call again to use video.",
            "Camera",
            5000
          );
        return;
      }
      unbindCameraListeners(t);
      if (t) {
        try {
          t.stop();
        } catch {}
      }
      cameraTrackRef.current = nt;
      bindCameraListeners(nt);
      const s = localStreamRef.current;
      if (s) {
        const ov = s.getVideoTracks()[0];
        if (ov && ov !== nt) s.removeTrack(ov);
        s.addTrack(nt);
        if (isMountedRef.current)
          setLocalStream(new MediaStream(s.getTracks()));
      }
      if (isMountedRef.current) {
        setCameraUnavailable(false);
        setVideoOff(false);
        setError(null);
      }
    } catch (e) {
      const n = e?.name;
      const msg =
        n === "NotAllowedError" || n === "SecurityError"
          ? "Camera access is blocked. Tap the 🔒 / camera icon in the address bar, set Camera to “Allow”, then tap the camera button again."
          : n === "NotReadableError"
          ? "Camera is busy — another tab or app is using it. Close that, then tap the camera button again."
          : "No camera available on this device.";
      if (isMountedRef.current) toastRef.current?.error?.(msg, "Camera", 6000);
    } finally {
      permBusyRef.current = false;
    }
  }, [videoOff, bindCameraListeners, unbindCameraListeners]);

  const switchCamera = useCallback(async () => {
    const t = cameraTrackRef.current;
    if (!t || screenSharing || cameraUnavailable) return;
    try {
      const preset = presetRef.current;
      const base = getMediaConstraints(preset);
      const nextFacing =
        t.getSettings().facingMode === "environment" ? "user" : "environment";
      const ns = await navigator.mediaDevices.getUserMedia({
        video: { ...base.video, facingMode: nextFacing },
        audio: false,
      });
      const nt = ns.getVideoTracks()[0];
      if (!nt) throw new Error("No video track returned");
      try {
        if ("contentHint" in nt)
          nt.contentHint = preset.contentHint || "motion";
      } catch {}
      unbindCameraListeners(t);
      t.stop();
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(nt);
        await applyVideoSenderQuality(videoSenderRef.current, preset);
      }
      cameraTrackRef.current = nt;
      bindCameraListeners(nt);
      const s = localStreamRef.current;
      if (s) {
        const oldV = s.getVideoTracks()[0];
        if (oldV && oldV !== nt) s.removeTrack(oldV);
        s.addTrack(nt);
        if (isMountedRef.current)
          setLocalStream(new MediaStream(s.getTracks()));
      }
    } catch {
      if (isMountedRef.current)
        toastRef.current?.error?.("Camera switch unavailable", "Call", 3000);
    }
  }, [
    screenSharing,
    cameraUnavailable,
    bindCameraListeners,
    unbindCameraListeners,
  ]);

  const toggleScreenShare = useCallback(async () => {
    if (!SUPPORTS_DISPLAYMEDIA) {
      if (isMountedRef.current)
        toastRef.current?.error?.(
          "Screen share not supported here",
          "Call",
          3000
        );
      return;
    }
    const preset = presetRef.current;
    if (screenSharing) {
      if (videoSenderRef.current && cameraTrackRef.current) {
        await videoSenderRef.current
          .replaceTrack(cameraTrackRef.current)
          .catch(() => {});
        await applyVideoSenderQuality(videoSenderRef.current, preset).catch(
          () => {}
        );
      }
      if (screenTrackRef.current) {
        try {
          screenTrackRef.current.stop();
        } catch {}
      }
      screenTrackRef.current = null;
      if (isMountedRef.current) setScreenSharing(false);
      return;
    }
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      const dt = ds.getVideoTracks()[0];
      if (!dt) throw new Error("No screen track returned");
      try {
        if ("contentHint" in dt) dt.contentHint = "detail";
      } catch {}
      screenTrackRef.current = dt;
      dt.addEventListener(
        "ended",
        () => {
          if (videoSenderRef.current && cameraTrackRef.current) {
            videoSenderRef.current
              .replaceTrack(cameraTrackRef.current)
              .catch(() => {});
            applyVideoSenderQuality(
              videoSenderRef.current,
              presetRef.current
            ).catch(() => {});
          }
          screenTrackRef.current = null;
          if (isMountedRef.current) setScreenSharing(false);
        },
        { once: true }
      );
      if (videoSenderRef.current) {
        await videoSenderRef.current.replaceTrack(dt);
        await applyVideoSenderQuality(videoSenderRef.current, preset);
      }
      if (isMountedRef.current) setScreenSharing(true);
    } catch {
      /* user cancelled picker */
    }
  }, [screenSharing]);

  useEffect(() => {
    if (!socket) return;
    const emit = (...a) => {
      try {
        socketRef.current?.emit(...a);
      } catch {}
    };

    const onReady = ({ callId: id, iceServers, to }) => {
      const cid = sanitizeCallId(id);
      const peerId = sanitizeCallId(to);
      if (!cid || !peerId) return;
      iceServersRef.current = sanitizeIceServers(iceServers);
      const pc = buildPc(iceServersRef.current);
      pc._callId = cid;
      pc._peerId = peerId;
      peerIdRef.current = peerId;
      if (isMountedRef.current) {
        setCallId(cid);
        setPeer(
          sanitizePeer({ _id: peerId }) || {
            _id: peerId,
            name: null,
            photo: null,
          }
        );
      }
    };

    const onAccepted = async ({ callId: id }) => {
      const cid = sanitizeCallId(id);
      if (phaseRef.current !== "outgoing" || !cid || cid !== callIdRef.current)
        return;
      clearNoAnswerTimer();
      try {
        const stream = await acquireLocal(mediaTypeRef.current);
        const pc = pcRef.current;
        if (!pc) return;
        attachLocalToPc(pc, stream);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: mediaTypeRef.current === "video",
        });
        await pc.setLocalDescription(offer);
        emit("call:signal", {
          callId: cid,
          to: pc._peerId,
          sdp: pc.localDescription,
        });
        setPhaseSafe("connecting");
      } catch (e) {
        const name = e?.name;
        if (isMountedRef.current) {
          // ✅ With the pre-flight in startCall this path is effectively dead
          //    (mic already granted). If it ever fires (revoked mid-call), give
          //    the same actionable text. An end here is unavoidable: the caller
          //    has no UI state to retreat to and no local media to send.
          if (name === "NotAllowedError" || name === "NotFoundError")
            toastRef.current?.error?.(
              permMessage({ mic: "denied", cam: null }, mediaTypeRef.current),
              "Permission needed",
              6000
            );
          else toastRef.current?.error?.("Could not start call", "Call", 4000);
        }
        emit("call:end", { callId: cid, reason: "error" });
        finalizeCall("failed");
        teardown();
      }
    };

    const onRing = (payload) => {
      clearNoAnswerTimer();
      const id = sanitizeCallId(payload?.callId);
      const mt = payload?.mediaType;
      const from = sanitizePeer(payload?.from);
      const ice = sanitizeIceServers(payload?.iceServers);
      if (!id || !from || (mt !== "audio" && mt !== "video")) {
        if (id) emit("call:reject", { callId: id, reason: "busy" });
        return;
      }
      if (phaseRef.current !== "idle") {
        emit("call:reject", { callId: id, reason: "busy" });
        return;
      }
      resetCallLog(from._id);
      iceServersRef.current = ice;
      if (isMountedRef.current) {
        setCallId(id);
        setPeer(from);
        setMediaType(mt);
      }
      setPhaseSafe("incoming");
      try {
        const pc = buildPc(ice);
        pc._callId = id;
        pc._peerId = from._id;
      } catch {
        emit("call:reject", { callId: id, reason: "busy" });
        finalizeCall("failed");
        teardown();
      }
    };

    const onDismiss = ({ callId: id }) => {
      const cid = sanitizeCallId(id);
      if (phaseRef.current === "incoming" && cid && cid === callIdRef.current)
        teardown();
    };

    const onRejected = (payload) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return;
      const reason =
        typeof payload?.reason === "string"
          ? payload.reason.replace(CONTROL_CHARS_RE, "").slice(0, 80)
          : "declined";
      if (isMountedRef.current) {
        toastRef.current?.info?.(
          reason === "busy"
            ? "They're on another call"
            : reason === "offline" || reason === "unreachable"
            ? "User is offline"
            : "Call declined",
          "Call",
          3000
        );
      }
      finalizeCall(mapRejectedStatus(reason));
      teardown();
    };

    const onEnded = (payload) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return;
      const ms = Number(payload?.durationMs);
      const safeDuration = Number.isFinite(ms) && ms > 0 ? ms : 0;
      const status =
        typeof payload?.status === "string"
          ? payload.status.replace(CONTROL_CHARS_RE, "").slice(0, 40)
          : "";
      const reason =
        typeof payload?.reason === "string"
          ? payload.reason.replace(CONTROL_CHARS_RE, "").slice(0, 40)
          : "";
      const label =
        status === "missed" || reason === "no-answer"
          ? "No answer"
          : reason === "offline" || reason === "unreachable"
          ? "User is offline"
          : reason === "blocked"
          ? "Call ended (blocked)"
          : "Call ended";
      if (isMountedRef.current) {
        if (safeDuration > 0)
          toastRef.current?.info?.(
            `${label} · ${fmt(safeDuration)}`,
            "Call",
            3000
          );
        else toastRef.current?.info?.(label, "Call", 3000);
      }
      finalizeCall(mapEndedStatus(payload), safeDuration);
      teardown();
    };

    const onBusy = () => {
      if (phaseRef.current !== "outgoing") return;
      if (isMountedRef.current)
        toastRef.current?.warning?.("You're already in a call", "Call", 3000);
      finalizeCall("busy");
      teardown();
    };

    const onSignal = async ({ callId: id, from, sdp, candidate }) => {
      const cid = sanitizeCallId(id);
      if (!cid || cid !== callIdRef.current) return;
      const pc = pcRef.current;
      if (!pc) return;
      const fromId = sanitizeCallId(
        typeof from === "string"
          ? from
          : from && typeof from === "object"
          ? from._id
          : null
      );
      if (!fromId) return;
      if (pc._peerId && fromId !== pc._peerId) return;

      if (sdp) {
        const cleanSdp = sanitizeSdp(sdp);
        if (!cleanSdp) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(cleanSdp));
          remoteDescSetRef.current = true;
          await flushPendingCandidates(pc);
          await applyAllSendersQuality(pc, presetRef.current).catch(() => {});
          if (pc.signalingState === "have-remote-offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            emit("call:signal", {
              callId: cid,
              to: pc._peerId,
              sdp: pc.localDescription,
            });
          }
        } catch (e) {
          if (isWebRtcDebugEnabled())
            console.error("setRemoteDescription failed", e);
        }
      } else if (candidate) {
        const cleanCandidate = sanitizeIceCandidate(candidate);
        if (!cleanCandidate) return;
        if (remoteDescSetRef.current) {
          try {
            await pc.addIceCandidate(cleanCandidate);
          } catch {}
        } else if (pendingCandidatesRef.current.length < MAX_PENDING_CANDIDATES)
          pendingCandidatesRef.current.push(cleanCandidate);
      }
    };

    const onError = (payload) => {
      const cid = sanitizeCallId(payload?.callId);
      if (cid && cid !== callIdRef.current) return;
      if (!cid && phaseRef.current === "idle") return;
      const safeMessage = sanitizeErrorMessage(payload?.message);
      if (isMountedRef.current)
        toastRef.current?.error?.(safeMessage, "Call", 4000);
      if (phaseRef.current !== "idle") {
        finalizeCall("failed");
        teardown();
      }
    };

    socket.on("call:ready", onReady);
    socket.on("call:accepted", onAccepted);
    socket.on("call:ring", onRing);
    socket.on("call:dismiss", onDismiss);
    socket.on("call:rejected", onRejected);
    socket.on("call:ended", onEnded);
    socket.on("call:busy", onBusy);
    socket.on("call:signal", onSignal);
    socket.on("call_error", onError);

    return () => {
      socket.off("call:ready", onReady);
      socket.off("call:accepted", onAccepted);
      socket.off("call:ring", onRing);
      socket.off("call:dismiss", onDismiss);
      socket.off("call:rejected", onRejected);
      socket.off("call:ended", onEnded);
      socket.off("call:busy", onBusy);
      socket.off("call:signal", onSignal);
      socket.off("call_error", onError);
    };
  }, [
    socket,
    buildPc,
    acquireLocal,
    attachLocalToPc,
    flushPendingCandidates,
    teardown,
    resetCallLog,
    finalizeCall,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const s = socketRef.current;
      const id = callIdRef.current;
      if (id && s) {
        try {
          s.emit("call:end", { callId: id, reason: "disconnected" });
        } catch {}
      }
      if (phaseRef.current !== "idle")
        finalizeCall(connectedAtRef.current ? "ended" : "canceled");
      teardownRef.current?.();
    };
  }, [finalizeCall]);

  return {
    phase,
    callId,
    peer,
    mediaType,
    localStream,
    remoteStream,
    muted,
    videoOff,
    cameraUnavailable,
    screenSharing,
    durationSec,
    error,
    supportsSpeaker: SUPPORTS_SETSINKID,
    supportsScreenShare: SUPPORTS_DISPLAYMEDIA,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    switchCamera,
    toggleScreenShare,
  };
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
