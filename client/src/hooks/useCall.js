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
  // 🔒 PERMISSION-FIX: requestMediaPermission is NO LONGER imported/used. The mic
  //    verdict now comes from classifyMic() below (a REAL getUserMedia probe), so a
  //    lying/unsupported navigator.permissions.query can never fake a "blocked" panel.
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
const RESTART_DEADLINE_MS = 15000; // 🔒 CONNECTIVITY: bound an ICE-restart attempt
// ✅ Built from char codes so the SOURCE is pure ASCII and can NEVER be corrupted
//    by copy/paste into /[ -]/g. Behaviorally identical to /[\u0000-\u001F\u007F]/g.
const CONTROL_CHARS_RE = new RegExp(
  "[" +
    String.fromCharCode(0) +
    "-" +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    "]",
  "g"
);

const MIC_PROBE_TIMEOUT_MS = 10000;

// (applySafeVideoCodecOrder REMOVED — U1.) preferVideoCodec in videoQuality.js is now
// profile-aware (H264-constrained-baseline first -> VP8 fallback -> main/high -> VP9 ->
// AV1), which is the correct iOS<->Chrome order. This flat VP8->VP9->H264->AV1 override
// ran AFTER preferVideoCodec and, because setCodecPreferences REPLACES the list, it
// CLOBBERED the profile ranking and re-put VP9 ahead of H.264 (old WebKit can choke).
// Single source of truth for codec order = preferVideoCodec. Both the sendrecv and the
// recvonly video transceiver now call it (U2/U3 below).

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

// 🔒 PERMISSION-FIX: replaces the old permMessage(). One accurate, kind-aware string
//    per real blocker. The OVERLAY renders the full panel from these kinds; this is
//    for the occasional toast (e.g. a post-gate transient). kind values come from
//    classifyMic() below.
const kindMessage = (kind, mt) => {
  switch (kind) {
    case "no-device":
      return "No microphone found. Connect a mic (or use a device with one), then try again.";
    case "occupied":
      return "The microphone is in use by another app or tab. Close it, then try again.";
    case "os-blocked":
      return "Your device or operating system is blocking the microphone for this browser, even though the site permission is allowed. Check your system privacy/microphone settings and make sure the browser is allowed and a mic is enabled.";
    case "site-denied":
      return "Microphone access is blocked for this site. Tap the lock / camera icon in the address bar, set Microphone to Allow, then try again.";
    case "prompt":
      return mt === "video"
        ? "Allow the microphone (and camera) so Maya~Milan can hear you on this call."
        : "Allow the microphone so Maya~Milan can hear you on this call.";
    case "blocked-unknown":
      return "We couldn't read the microphone permission for this browser. Try the lock icon in the address bar AND your system microphone privacy settings.";
    default:
      return "Couldn't access the microphone. Check your permissions and try again.";
  }
};

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
  // 🔒 PERMISSION-FIX: shape is now { mediaType, kind } (kind from a REAL probe),
  //    not { mediaType, probe } (which trusted an unreliable query / a hardcoded
  //    "denied"). null = no panel. The panel is set ONLY when classifyMic() says the
  //    mic genuinely cannot be used, so a working mic NEVER shows it.
  const [permissionIssue, setPermissionIssue] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteTracksRef = useRef(new Set());
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const videoSenderRef = useRef(null);
  const videoTransceiverRef = useRef(null);
  const audioSenderRef = useRef(null); // ✅ the audio RTCRtpSender
  const audioOutTrackRef = useRef(null); // ✅ the track actually transmitted (cleaned or raw)
  const audioDisposeRef = useRef(null); // ✅ denoiser teardown
  const pendingCandidatesRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const durationTimerRef = useRef(null);
  const iceDisconnectTimerRef = useRef(null);
  const noAnswerTimerRef = useRef(null);
  const restartTimerRef = useRef(null); // 🔒 CONNECTIVITY: ICE-restart deadline
  const iceServersRef = useRef([]);
  const phaseRef = useRef("idle");
  const callIdRef = useRef(null);
  const mediaTypeRef = useRef("audio");
  const isCallerRef = useRef(false); // 🔒 CONNECTIVITY: only the caller restarts ICE (no glare)

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
  const permBusyRef = useRef(false); // ✅ double-tap / concurrent-probe guard
  const pendingRef = useRef(null); // ✅ { type:'start'|'accept'|'caller-media', ...args }
  const startCallRef = useRef(null);
  const acceptCallRef = useRef(null);

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
  // 🔒 CONNECTIVITY-FIX: set the callId ref SYNCHRONOUSLY alongside state so an
  //    immediately-following socket event (e.g. the server's offline call:rejected,
  //    emitted in the same tick as call:ready) matches and is NOT dropped. The old
  //    code updated callIdRef only via a [callId] effect, so onRejected saw null and
  //    the caller hung on "Ringing..." for 30s on an offline callee.
  const setCallIdSync = (cid) => {
    callIdRef.current = cid;
    if (isMountedRef.current) setCallId(cid);
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
  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
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
    clearRestartTimer(); // 🔒 CONNECTIVITY
    clearQualityBindings();

    callIdRef.current = null; // 🔒 CONNECTIVITY: null the ref synchronously too

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
    videoTransceiverRef.current = null;

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
      setPermissionIssue(null); // ✅ dismiss the permission panel with the call
    }
    pendingRef.current = null;
    isCallerRef.current = false;
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
      pc._restarted = false; // 🔒 CONNECTIVITY: single-shot restart guard

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

      // 🔒 CONNECTIVITY-FIX: ICE restart for mobile Wi-Fi<->cellular handoff. Only
      //    the CALLER initiates a renewed offer (the callee just answers) to avoid
      //    offer glare; only once per connection; only if we HAD connected (never
      //    restart a call that was still establishing). Bounded by RESTART_DEADLINE_MS.
      const attemptIceRestart = () => {
        if (
          !(
            isCallerRef.current &&
            !pc._restarted &&
            connectedAtRef.current &&
            pcRef.current === pc
          )
        )
          return false;
        pc._restarted = true;
        try {
          pc.restartIce();
        } catch {}
        (async () => {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            socketRef.current?.emit("call:signal", {
              callId: pc._callId,
              to: pc._peerId,
              sdp: pc.localDescription,
            });
          } catch {}
        })();
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (pcRef.current === pc && pc.connectionState !== "connected") {
            if (isMountedRef.current) setError("Connection failed");
            try {
              socketRef.current?.emit("call:end", {
                callId: pc._callId,
                reason: "error",
              });
            } catch {}
            finalizeCall("failed");
            teardown();
          }
        }, RESTART_DEADLINE_MS);
        return true;
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") {
          clearIceDisconnectTimer();
          clearNoAnswerTimer();
          clearRestartTimer();
          pc._restarted = false; // allow a FUTURE handoff to restart again
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
          if (attemptIceRestart()) return; // try a relay re-bind before giving up
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
              if (attemptIceRestart()) return; // handoff in progress -> restart, not drop
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

  const acquireLocal = useCallback(
    async (mt) => {
      const preset = presetRef.current;
      const base = getMediaConstraints(preset);
      const audioOnly = { audio: base.audio, video: false };
      let stream = null;
      let degraded = false;
      let camFail = null;
      if (mt === "video") {
        try {
          stream = await navigator.mediaDevices.getUserMedia(base);
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
        setCameraUnavailable(true);
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

  const applyNoiseSuppression = useCallback(async () => {
    try {
      const sender = audioSenderRef.current;
      const raw =
        sender?.track || localStreamRef.current?.getAudioTracks?.()[0] || null;
      if (!sender || !raw || raw.kind !== "audio") return;
      if (audioOutTrackRef.current === sender.track) return;
      const built = await buildProcessedAudioTrack(raw);
      if (!built?.track || typeof built.dispose !== "function") return;
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
            if (!isMountedRef.current) return;
            if (audioOutTrackRef.current === built.track)
              audioOutTrackRef.current = null;
            if (audioDisposeRef.current === built.dispose)
              audioDisposeRef.current = null;
          },
          { once: true }
        );
      } catch {}
      if (isWebRtcDebugEnabled())
        console.log("🎚 microphone noise suppression engaged");
    } catch (e) {
      if (isWebRtcDebugEnabled())
        console.warn(
          "noise suppression skipped (raw/browser NS remains active):",
          e?.message || e
        );
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
              // U2: single source of truth = profile-aware preferVideoCodec
              // (H264-constrained-baseline -> VP8 -> main/high -> VP9 -> AV1).
              // The flat applySafeVideoCodecOrder override is GONE (it clobbered this).
              preferVideoCodec(transceiver, "compatible");
              videoSenderRef.current = transceiver.sender;
              videoTransceiverRef.current = transceiver;
            } else if (track.kind === "audio") {
              audioSenderRef.current = transceiver.sender;
            }
          } else {
            const sender = pc.addTrack(track, stream);
            if (track.kind === "video") videoSenderRef.current = sender;
            else if (track.kind === "audio") audioSenderRef.current = sender;
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
          const recv = pc.addTransceiver("video", { direction: "recvonly" });
          preferVideoCodec(recv, "compatible");
          videoTransceiverRef.current = recv;
        } catch {}
      }
      applyAllSendersQuality(pc, preset).catch(() => {});
      void applyNoiseSuppression();
    },
    [applyNoiseSuppression]
  );

  const establishCallerMedia = useCallback(
    async (pc, cid) => {
      const stream = await acquireLocal(mediaTypeRef.current);
      attachLocalToPc(pc, stream);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mediaTypeRef.current === "video",
      });
      await pc.setLocalDescription(offer);
      try {
        socketRef.current?.emit("call:signal", {
          callId: cid,
          to: pc._peerId,
          sdp: pc.localDescription,
        });
      } catch {}
    },
    [acquireLocal, attachLocalToPc]
  );

  // 🔒 PERMISSION-FIX: the SINGLE definitive mic check. PRIMARY signal = a real
  //    getUserMedia (works even when navigator.permissions.query is unsupported or
  //    lying). The site query is read ONLY to SUBDIVIDE a genuine gUM failure so we
  //    can point the user at the RIGHT place to fix it:
  //      ok             -> mic usable  -> NO panel, ever (this is the fix for the
  //                                       false "blocked" panel when the mic works)
  //      site-denied    -> lock icon / site settings will help
  //      os-blocked     -> site ALLOWED but OS/hardware/privacy blocks it; the lock
  //                        icon WON'T help (the "I allowed it, still blocked" case)
  //      occupied       -> another app/tab holds the device
  //      no-device      -> nothing to grant
  //      prompt         -> not granted yet, but a gesture can show the native dialog
  //      blocked-unknown-> query unsupported/lying on a NotAllowedError
  //      unknown        -> timeout / unexpected
  //    The probe stream is stopped immediately so the mic is never left hot. When
  //    called inside a user gesture with state "prompt", the gUM shows the native
  //    dialog (this doubles as the warm-up).
  const classifyMic = useCallback(async () => {
    let siteState = null;
    try {
      siteState =
        (await navigator.permissions?.query?.({ name: "microphone" }))?.state ||
        null;
    } catch {}

    let stream = null;
    let errName = null;
    let timedOut = false;
    try {
      const p = navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const to = new Promise((_, rej) =>
        setTimeout(() => {
          timedOut = true;
          rej(new DOMException("probe-timeout", "TimeoutError"));
        }, MIC_PROBE_TIMEOUT_MS)
      );
      stream = await Promise.race([p, to]);
      try {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      } catch {}
      return { granted: true, kind: "ok" };
    } catch (e) {
      errName = e?.name || "Error";
      if (stream) {
        try {
          stream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
        } catch {}
      }
    }

    if (timedOut) return { granted: false, kind: "unknown" };
    if (errName === "NotReadableError" || errName === "AbortError")
      return { granted: false, kind: "occupied" };
    if (
      errName === "NotFoundError" ||
      errName === "OverconstrainedError" ||
      errName === "DevicesNotFoundError"
    )
      return { granted: false, kind: "no-device" };
    if (
      errName === "NotAllowedError" ||
      errName === "SecurityError" ||
      errName === "PermissionDeniedError"
    ) {
      // Re-query AFTER the failure: a just-clicked "Block" flips the site state to
      // "denied" synchronously, whereas a no-gesture dismissal leaves it "prompt".
      let s2 = siteState;
      try {
        s2 =
          (await navigator.permissions?.query?.({ name: "microphone" }))
            ?.state || siteState;
      } catch {}
      if (s2 === "denied") return { granted: false, kind: "site-denied" };
      if (s2 === "granted") return { granted: false, kind: "os-blocked" };
      if (s2 === "prompt") return { granted: false, kind: "prompt" };
      return { granted: false, kind: "blocked-unknown" };
    }
    return { granted: false, kind: "unknown" };
  }, []);

  // ✅ Caller: classifyMic() only WARMS the native prompt during the Call click
  //    (user activation). Ringing is NOT gated on the local mic — we emit
  //    call:start immediately so the OTHER device rings even if our mic is
  //    blocked/denied. The real mic gate happens at media-acquisition time
  //    (onAccepted for us-as-caller, acceptCall for us-as-callee), where a denial
  //    shows a RESUMABLE panel with the ACCURATE kind. All inbound ids sanitized;
  //    phase re-checked after the await (race guard).
  const startCall = useCallback(
    async (to, mt, conversationId) => {
      if (phaseRef.current !== "idle" || !socketRef.current) return;
      if (mt !== "audio" && mt !== "video") return;
      if (permBusyRef.current) return;
      const safeTo = sanitizeCallId(to);
      if (!safeTo) return;
      const safeConv = conversationId
        ? sanitizeCallId(conversationId)
        : undefined;

      permBusyRef.current = true;
      try {
        // 🔒 warm-up only (result discarded): in-gesture gUM surfaces the native
        //    dialog if state is "prompt"; we ring regardless of the outcome.
        await classifyMic();
      } finally {
        permBusyRef.current = false;
      }
      if (phaseRef.current !== "idle" || !socketRef.current) return;

      // 🔒 no panel at place-time on the caller (the gate is at onAccepted). Clear
      //    any stale panel/pending from a prior attempt before we dial.
      setPermissionIssue(null);
      pendingRef.current = null;

      resetCallLog(safeTo);
      setMediaType(mt);
      isCallerRef.current = true; // 🔒 CONNECTIVITY: this side may restart ICE
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
    [teardown, resetCallLog, finalizeCall, classifyMic]
  );
  useEffect(() => {
    startCallRef.current = startCall;
  }, [startCall]);

  // ✅ Callee: classifyMic() while phase is STILL "incoming" (no "connecting" set,
  //    nothing emitted to the caller). Granted -> connect. NOT granted -> stay
  //    "incoming" with the ACCURATE kind (the panel is the retry surface); we do
  //    NOT reject and do NOT tear down. Because classifyMic does a REAL gUM, a
  //    working mic is reported granted here and NO panel is shown (false-positive
  //    fix). A genuine non-permission media failure ends the call.
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
    if (permBusyRef.current) return;

    permBusyRef.current = true;
    let c;
    try {
      c = await classifyMic();
    } finally {
      permBusyRef.current = false;
    }
    if (phaseRef.current !== "incoming") return;
    if (!c.granted) {
      pendingRef.current = { type: "accept" };
      setPermissionIssue({ mediaType: mediaTypeRef.current, kind: c.kind });
      return;
    }

    setPermissionIssue(null);
    pendingRef.current = null;

    try {
      setError(null);
      setPhaseSafe("connecting");
      const stream = await acquireLocal(mediaTypeRef.current);
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
      // 🔒 A real acquire failure right after a granted probe is almost always a
      //    "device just released" transient. Re-classify: if still not granted ->
      //    accurate panel + stay incoming (no auto-reject). If granted -> retry the
      //    acquire ONCE; if that also fails -> genuine error -> reject + teardown.
      const c2 = await classifyMic();
      if (!c2.granted) {
        pendingRef.current = { type: "accept" };
        setPermissionIssue({ mediaType: mediaTypeRef.current, kind: c2.kind });
        setPhaseSafe("incoming");
        return;
      }
      try {
        const stream = await acquireLocal(mediaTypeRef.current);
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
        return;
      } catch {
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
    }
  }, [
    peer,
    acquireLocal,
    buildPc,
    attachLocalToPc,
    teardown,
    finalizeCall,
    classifyMic,
  ]);
  useEffect(() => {
    acceptCallRef.current = acceptCall;
  }, [acceptCall]);

  // 🔒 PERMISSION-FIX: "Allow / Continue" re-runs the REAL probe (classifyMic), not
  //    a query. Granted -> clear + resume by pending type. Not granted -> re-arm the
  //    panel with the ACCURATE kind (so site-denied vs os-blocked vs occupied show
  //    the right instructions) and return false so the overlay can hint. Never toasts.
  const resolvePermission = useCallback(async () => {
    if (permBusyRef.current) return false;
    const pend = pendingRef.current;
    if (!pend) return false;
    permBusyRef.current = true;
    let c;
    try {
      c = await classifyMic();
    } finally {
      permBusyRef.current = false;
    }
    if (!c.granted) {
      setPermissionIssue({ mediaType: mediaTypeRef.current, kind: c.kind });
      return false;
    }
    setPermissionIssue(null);
    pendingRef.current = null;
    if (pend?.type === "start")
      void startCallRef.current?.(pend.to, pend.mt, pend.conversationId);
    else if (pend?.type === "accept") void acceptCallRef.current?.();
    else if (pend?.type === "caller-media") {
      const pc = pcRef.current;
      const cid = callIdRef.current;
      if (!pc || !cid) return true;
      try {
        await establishCallerMedia(pc, cid);
      } catch {
        // 🔒 bounded single re-classify: permission/device -> re-arm (no loop,
        //    wake-ups are edge-triggered); anything else -> end cleanly.
        const c2 = await classifyMic();
        if (!c2.granted) {
          pendingRef.current = { type: "caller-media" };
          setPermissionIssue({
            mediaType: mediaTypeRef.current,
            kind: c2.kind,
          });
        } else {
          try {
            socketRef.current?.emit("call:end", {
              callId: cid,
              reason: "error",
            });
          } catch {}
          finalizeCall("failed");
          teardown();
        }
      }
    }
    return true;
  }, [establishCallerMedia, classifyMic, teardown, finalizeCall]);

  // ═══════════════════════════════════════════════════════════════════════
  // 🔒 UX-FIX (auto-resolve): the "Microphone is blocked" panel previously cleared
  //    ONLY on a manual "continue" press (which re-ran classifyMic). But that block is
  //    almost always the SITE permission, and Chrome fires a live `change` event on the
  //    microphone PermissionStatus the instant the user flips the address-bar toggle —
  //    so while a permission-gate panel is open we subscribe to it and auto-resume the
  //    pending call the moment the grant lands, with NO button press. Feature-detected
  //    (unsupported/throwing query -> no listener; "continue" remains the fallback).
  //    We attach ONLY for permission-gate kinds; occupied/no-device/unknown are
  //    hardware/app-side and a permission change can't fix them, so we don't spam probes.
  //    This reuses resolvePermission verbatim (same resume branching for start/accept/
  //    caller-media, same accurate re-arm), so it adds NO new socket surface and trusts
  //    NO remote data — it is a passive listener on a browser PermissionStatus object.
  //    NOTE: on macOS the OS privacy gate is a SEPARATE switch that does NOT fire this
  //    page's onchange; flipping it still needs the manual ⌘Q-quit-and-reopen below.
  // ═══════════════════════════════════════════════════════════════════════
  const resolvePermissionRef = useRef(resolvePermission);
  useEffect(() => {
    resolvePermissionRef.current = resolvePermission;
  }, [resolvePermission]);
  useEffect(() => {
    if (!permissionIssue) return;
    const AUTO_KINDS = new Set([
      "site-denied",
      "os-blocked",
      "prompt",
      "blocked-unknown",
    ]);
    if (!AUTO_KINDS.has(permissionIssue.kind)) return;
    let status = null;
    let cancelled = false;
    const onChange = () => {
      // let the toggle settle, then re-probe + resume via the SAME path "continue"
      // uses (handles every pending type, and re-arms the panel with the accurate NEW
      // kind — e.g. site-denied -> os-blocked — if the macOS gate is ALSO blocking).
      setTimeout(() => {
        if (!cancelled) void resolvePermissionRef.current?.();
      }, 250);
    };
    try {
      navigator.permissions
        ?.query?.({ name: "microphone" })
        .then((s) => {
          if (cancelled || !s) return;
          status = s;
          status.onchange = onChange;
        })
        .catch(() => {});
    } catch {}
    return () => {
      cancelled = true;
      try {
        if (status) status.onchange = null;
      } catch {}
    };
  }, [permissionIssue]);

  const clearPermissionIssue = useCallback(() => {
    pendingRef.current = null;
    setPermissionIssue(null);
  }, []);

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
      if (phaseRef.current === "idle") {
        teardown();
        return;
      }
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

  const toggleVideo = useCallback(async () => {
    if (phaseRef.current === "idle" || phaseRef.current === "incoming") return;
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
        await videoSenderRef.current.replaceTrack(nt);
        await applyVideoSenderQuality(videoSenderRef.current, preset).catch(
          () => {}
        );
      } else {
        // 🔒 VIDEO-UP-FIX: a side that connected audio-only (camera denied/unavailable/
        //    occupied at Accept -> recvonly video transceiver, no sender) previously
        //    dead-ended with "hang up and call again". Instead, upgrade the existing
        //    recvonly video transceiver to sendrecv (or add one), attach the new track,
        //    and renegotiate so video starts flowing to the peer WITHOUT hanging up.
        //    The peer's existing onSignal already answers a remote offer, and the server
        //    already relays call:signal, so no protocol/server change is required.
        const pc = pcRef.current;
        if (!pc) {
          try {
            nt.stop();
          } catch {}
          if (isMountedRef.current)
            toastRef.current?.error?.(
              "No active call to add video to.",
              "Camera",
              4000
            );
          return;
        }
        let tr = videoTransceiverRef.current;
        if (!tr || !tr.sender) {
          tr = pc.addTransceiver(nt, { direction: "sendrecv" });
        } else {
          try {
            tr.direction = "sendrecv";
          } catch {}
          try {
            await tr.sender.replaceTrack(nt);
          } catch {
            tr = pc.addTransceiver(nt, { direction: "sendrecv" });
          }
        }
        videoTransceiverRef.current = tr;
        videoSenderRef.current = tr.sender;
        await applyVideoSenderQuality(tr.sender, preset).catch(() => {});
        // Renegotiate only from a stable state (avoid glare with an in-flight offer);
        // a simultaneous peer offer is rare on a manual tap and is caught by onSignal.
        if (pc.signalingState === "stable") {
          try {
            const off = await pc.createOffer();
            await pc.setLocalDescription(off);
            socketRef.current?.emit("call:signal", {
              callId: pc._callId,
              to: pc._peerId,
              sdp: pc.localDescription,
            });
          } catch (e) {
            if (isWebRtcDebugEnabled())
              console.warn("video renegotiate offer failed:", e?.message || e);
          }
        } else if (isWebRtcDebugEnabled()) {
          console.warn(
            "skipped video renegotiation, signalingState =",
            pc.signalingState
          );
        }
        // NO return: fall through to the shared post-processing below (unbind old,
        // cameraTrackRef=nt, bind, localStream.addTrack(nt), setVideoOff(false), etc.)
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
          if (!isMountedRef.current) return;
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
      if (phaseRef.current !== "outgoing") return;
      if (pcRef.current) return;
      if (peerIdRef.current && peerId !== peerIdRef.current) return;
      iceServersRef.current = sanitizeIceServers(iceServers);
      let pc;
      try {
        pc = buildPc(iceServersRef.current);
      } catch {
        try {
          socketRef.current?.emit("call:end", { callId: cid, reason: "error" });
        } catch {}
        finalizeCall("failed");
        teardown();
        return;
      }
      pc._callId = cid;
      pc._peerId = peerId;
      peerIdRef.current = peerId;
      isCallerRef.current = true; // 🔒 CONNECTIVITY
      if (isMountedRef.current) {
        setCallIdSync(cid); // 🔒 CONNECTIVITY: sync ref so an immediate call:rejected matches
        setPeer(
          sanitizePeer({ _id: peerId }) || {
            _id: peerId,
            name: null,
            photo: null,
          }
        );
      } else {
        callIdRef.current = cid;
      }
    };

    const onAccepted = async ({ callId: id }) => {
      const cid = sanitizeCallId(id);
      if (phaseRef.current !== "outgoing" || !cid || cid !== callIdRef.current)
        return;
      const pc = pcRef.current;
      if (!pc) return;
      clearNoAnswerTimer();
      setPhaseSafe("connecting");
      try {
        await establishCallerMedia(pc, cid);
      } catch (e) {
        // 🔒 PERMISSION-FIX: classify the REAL cause instead of hardcoding "denied".
        //    Not granted -> accurate resumable panel (caller-media), keep call alive.
        //    Granted (transient/race) -> retry the offer ONCE; if it fails again,
        //    re-classify -> re-arm on a permission/device error, else end cleanly.
        const c = await classifyMic();
        if (!c.granted) {
          pendingRef.current = { type: "caller-media" };
          setPermissionIssue({
            mediaType: mediaTypeRef.current,
            kind: c.kind,
          });
          return;
        }
        try {
          await establishCallerMedia(pc, cid);
          return;
        } catch {
          const c2 = await classifyMic();
          if (!c2.granted) {
            pendingRef.current = { type: "caller-media" };
            setPermissionIssue({
              mediaType: mediaTypeRef.current,
              kind: c2.kind,
            });
            return;
          }
          if (isMountedRef.current)
            toastRef.current?.error?.("Could not start call", "Call", 4000);
          try {
            socketRef.current?.emit("call:end", {
              callId: cid,
              reason: "error",
            });
          } catch {}
          finalizeCall("failed");
          teardown();
        }
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
      setPermissionIssue(null);
      pendingRef.current = null;
      resetCallLog(from._id);
      iceServersRef.current = ice;
      isCallerRef.current = false; // 🔒 CONNECTIVITY: callee never initiates restart (avoids glare)
      if (isMountedRef.current) {
        setCallIdSync(id); // 🔒 CONNECTIVITY: sync ref so an immediate dismiss/ended matches
        setPeer(from);
        setMediaType(mt);
      } else {
        callIdRef.current = id;
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
    establishCallerMedia,
    classifyMic,
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
    permissionIssue, // ✅ { mediaType, kind } | null -> overlay renders the panel
    resolvePermission, // ✅ real-probe resume (re-runs classifyMic)
    clearPermissionIssue, // ✅ dismiss the panel
  };
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
