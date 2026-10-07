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
  const remoteTracksRef = useRef(new Set()); // #6 live remote track set
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const videoSenderRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const durationTimerRef = useRef(null);
  const iceDisconnectTimerRef = useRef(null);
  const noAnswerTimerRef = useRef(null);
  const iceServersRef = useRef([]);
  const phaseRef = useRef("idle");
  const callIdRef = useRef(null);
  const mediaTypeRef = useRef("audio");

  const presetRef = useRef(getDefaultPreset());
  const qualityStopRef = useRef(null);
  const statsStopRef = useRef(null);
  const isMountedRef = useRef(true);
  const socketRef = useRef(socket);
  const teardownRef = useRef(null);

  // #2 stabilize toast so the socket effect subscribes ONCE per socket.
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

  // publish the live remote track set as a fresh MediaStream so React re-renders
  // correctly when tracks are added AND removed (fixes frozen/placeholder state).
  const publishRemote = useCallback(() => {
    const tracks = Array.from(remoteTracksRef.current);
    if (tracks.length === 0) {
      if (isMountedRef.current) setRemoteStream(null);
      return;
    }
    const ms = new MediaStream(tracks);
    if (isMountedRef.current) setRemoteStream(ms);
  }, []);

  const teardown = useCallback(() => {
    clearDurationTimer();
    clearIceDisconnectTimer();
    clearNoAnswerTimer();
    clearQualityBindings();

    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    iceServersRef.current = [];
    remoteTracksRef.current = new Set();

    if (pcRef.current) {
      try {
        pcRef.current._abort?.abort(); // #6 drop ontrack/ended listeners
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
      } catch {} // #6 unbind cam listeners
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

  // #6 system mute/unmute => cameraUnavailable (NOT user videoOff), AbortController-managed.
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
      clearQualityBindings(); // #6 never leak a previous pc's timers on retry

      const safeServers = sanitizeIceServers(iceServers);
      const pc = createHighQualityPeerConnection(safeServers);
      pcRef.current = pc;
      pc._callId = null;
      pc._peerId = null;
      pc._abort = new AbortController(); // #6 scoped listener teardown

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

      // #6 robust remote assembly via track set + AbortController (no onended clobber).
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
              teardown();
            }
          }, ICE_DISCONNECT_GRACE_MS);
        }
      };

      return pc;
    },
    [teardown, publishRemote]
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

  // Graceful acquisition: busy/denied CAMERA must NOT cancel; mic failure aborts.
  const acquireLocal = useCallback(
    async (mt) => {
      const preset = presetRef.current;
      const base = getMediaConstraints(preset);
      const audioOnly = { audio: base.audio, video: false };

      let stream = null;
      let degraded = false;

      if (mt === "video") {
        try {
          stream = await navigator.mediaDevices.getUserMedia(base);
          if (!stream.getVideoTracks().length) {
            try {
              stream.getTracks().forEach((t) => t.stop());
            } catch {}
            stream = null;
          }
        } catch {
          stream = null;
        }
        if (!stream) {
          degraded = true;
          stream = await navigator.mediaDevices.getUserMedia(audioOnly); // may throw -> abort
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
        toastRef.current?.warning?.(
          "Camera unavailable — continuing with audio only",
          "Call",
          4000
        );
      }
      if (isWebRtcDebugEnabled()) await logLocalMediaSettings(stream);
      return stream;
    },
    [bindCameraListeners]
  );

  const attachLocalToPc = useCallback((pc, stream) => {
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
            preferVideoCodec(transceiver, "compatible"); // #1 valid order
            videoSenderRef.current = transceiver.sender;
          }
        } else {
          const sender = pc.addTrack(track, stream);
          if (track.kind === "video") videoSenderRef.current = sender;
        }
      } catch (err) {
        if (isWebRtcDebugEnabled())
          console.warn("attachLocalToPc track failed:", err?.message || err);
      }
    });
    // audio-only side must still RECEIVE peer video (cross-browser).
    const hasVideoSender = pc
      .getSenders()
      .some((s) => s.track?.kind === "video");
    if (!hasVideoSender && typeof pc.addTransceiver === "function") {
      try {
        pc.addTransceiver("video", { direction: "recvonly" });
      } catch {}
    }
    applyAllSendersQuality(pc, preset).catch(() => {});
  }, []);

  const startCall = useCallback(
    (to, mt, conversationId) => {
      if (phaseRef.current !== "idle" || !socketRef.current) return;
      if (mt !== "audio" && mt !== "video") return;
      const safeTo = sanitizeCallId(to);
      if (!safeTo) return;
      const safeConv = conversationId
        ? sanitizeCallId(conversationId)
        : undefined;

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
        teardown();
        return;
      }

      clearNoAnswerTimer();
      noAnswerTimerRef.current = setTimeout(() => {
        // #4 fire even if call:ready never arrived (callIdRef may be null).
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
        teardown();
      }, OUTGOING_NO_ANSWER_MS);
    },
    [teardown]
  );

  const acceptCall = useCallback(async () => {
    if (
      phaseRef.current !== "incoming" ||
      !callIdRef.current ||
      !socketRef.current
    )
      return;
    const id = callIdRef.current;
    const peerId = peer?._id;
    if (!peerId) {
      try {
        socketRef.current.emit("call:reject", {
          callId: id,
          reason: "declined",
        });
      } catch {}
      teardown();
      return;
    }
    try {
      setPhaseSafe("connecting");
      const stream = await acquireLocal(mediaTypeRef.current);
      const pc = pcRef.current || buildPc(iceServersRef.current || []);
      pc._callId = id;
      pc._peerId = peerId;
      attachLocalToPc(pc, stream);
      try {
        socketRef.current.emit("call:accept", { callId: id });
      } catch {
        teardown();
      }
    } catch (e) {
      const name = e?.name;
      if (isMountedRef.current) {
        if (name === "NotAllowedError" || name === "NotFoundError")
          toastRef.current?.error?.(
            "Microphone permission denied",
            "Call",
            4000
          );
        else toastRef.current?.error?.("Could not start call", "Call", 4000);
      }
      try {
        socketRef.current.emit("call:reject", {
          callId: id,
          reason: "declined",
        });
      } catch {}
      teardown();
    }
  }, [peer, acquireLocal, buildPc, attachLocalToPc, teardown]);

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
    teardown();
  }, [teardown]);

  const endCall = useCallback(
    (reason = "hangup") => {
      if (!socketRef.current) {
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
      teardown();
    },
    [teardown]
  );

  const toggleMute = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    if (isMountedRef.current) setMuted(next);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    if (cameraUnavailable) return;
    const t = cameraTrackRef.current;
    if (!t) return;
    const next = !videoOff;
    t.enabled = !next;
    if (isMountedRef.current) setVideoOff(next);
  }, [videoOff, cameraUnavailable]);

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
      unbindCameraListeners(t); // #6 strip old listeners before stop
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

  // Single subscription per socket (deps are all stable refs/callbacks now -> #2).
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
          if (name === "NotAllowedError" || name === "NotFoundError")
            toastRef.current?.error?.(
              "Microphone permission denied",
              "Call",
              4000
            );
          else toastRef.current?.error?.("Could not start call", "Call", 4000);
        }
        emit("call:end", { callId: cid, reason: "error" });
        teardown();
      }
    };

    const onRing = (payload) => {
      clearNoAnswerTimer(); // #7 drop any lingering outgoing timer
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
        teardown();
      }
    };

    // #3 require exact callId match (no fall-through teardown on missing id).
    const onDismiss = ({ callId: id }) => {
      const cid = sanitizeCallId(id);
      if (phaseRef.current === "incoming" && cid && cid === callIdRef.current)
        teardown();
    };

    const onRejected = (payload) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return; // #3
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
      teardown();
    };

    const onEnded = (payload) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return; // #3
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
      teardown();
    };

    const onBusy = () => {
      if (phaseRef.current !== "outgoing") return; // #3 busy only cancels OUR attempt
      if (isMountedRef.current)
        toastRef.current?.warning?.("You're already in a call", "Call", 3000);
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
      if (pc._peerId && fromId !== pc._peerId) return; // signaling-hijack guard

      if (sdp) {
        const cleanSdp = sanitizeSdp(sdp);
        if (!cleanSdp) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(cleanSdp));
          remoteDescSetRef.current = true;
          await flushPendingCandidates(pc);
          await applyAllSendersQuality(pc, presetRef.current).catch(() => {});
          // #5 answer exactly once, driven by signaling state (idempotent vs re-offer).
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
      if (cid && cid !== callIdRef.current) return; // targeted error -> only if ours
      if (!cid && phaseRef.current === "idle") return; // #3 global error ignored when idle
      const safeMessage = sanitizeErrorMessage(payload?.message);
      if (isMountedRef.current)
        toastRef.current?.error?.(safeMessage, "Call", 4000);
      if (phaseRef.current !== "idle") teardown();
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
      teardownRef.current?.();
    };
  }, []);

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
