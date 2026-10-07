import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./useSocket.js";
import { useAlert } from "../context/AlertContext";

const SUPPORTS_SETSINKID =
  typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
const SUPPORTS_DISPLAYMEDIA =
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
const ICE_DISCONNECT_GRACE_MS = 8000; // half-open media -> self-end (availability)

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
  const [videoOff, setVideoOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const videoSenderRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const durationTimerRef = useRef(null);
  const iceDisconnectTimerRef = useRef(null);
  const iceServersRef = useRef([]); // ✅ replaces window.__pendingIce
  const phaseRef = useRef("idle");
  const callIdRef = useRef(null);
  const mediaTypeRef = useRef("audio");
  const setPhaseSafe = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // keep mirror refs fresh (declared up-top so the listener effect below reads live values)
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

  const teardown = useCallback(() => {
    clearDurationTimer();
    clearIceDisconnectTimer();
    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    iceServersRef.current = [];
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate =
          pcRef.current.ontrack =
          pcRef.current.onconnectionstatechange =
            null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    cameraTrackRef.current = null;
    videoSenderRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setVideoOff(false);
    setScreenSharing(false);
    setDurationSec(0);
    setCallId(null);
    setPeer(null);
    setError(null);
    setPhaseSafe("idle");
  }, []);

  // attach/detach the camera mute->videoOff listeners on a track (re-used after switchCamera)
  const bindCameraListeners = useCallback((track) => {
    if (!track) return;
    const onMute = () => setVideoOff(true);
    const onUnmute = () => setVideoOff(false);
    track.addEventListener("mute", onMute);
    track.addEventListener("unmute", onUnmute);
    track.__mayaListeners = [onMute, onUnmute]; // so we can strip on stop if needed
  }, []);

  const buildPc = useCallback(
    (iceServers) => {
      const pc = new RTCPeerConnection({
        iceServers,
        bundlePolicy: "max-bundle",
      });
      pcRef.current = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate && socket && pc._callId) {
          socket.emit("call:signal", {
            callId: pc._callId,
            to: pc._peerId,
            candidate: e.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (e) => {
        const [stream] = e.streams;
        if (stream) setRemoteStream(stream);
      };
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") {
          clearIceDisconnectTimer();
          setPhaseSafe("in-call");
          socket?.emit("call:connected", { callId: pc._callId });
          clearDurationTimer();
          const start = Date.now();
          durationTimerRef.current = setInterval(
            () => setDurationSec(Math.floor((Date.now() - start) / 1000)),
            1000
          );
        } else if (st === "failed") {
          setError("Connection failed");
          socket?.emit("call:end", { callId: pc._callId, reason: "error" });
          teardown();
        } else if (st === "disconnected") {
          // half-open: give ICE a grace window, then self-end so the registry/media don't leak
          clearIceDisconnectTimer();
          iceDisconnectTimerRef.current = setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState !== "connected") {
              socket?.emit("call:end", { callId: pc._callId, reason: "error" });
              teardown();
            }
          }, ICE_DISCONNECT_GRACE_MS);
        }
      };
      return pc;
    },
    [socket, teardown]
  );

  const flushPendingCandidates = useCallback(async (pc) => {
    for (const c of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
    pendingCandidatesRef.current = [];
  }, []);

  const acquireLocal = useCallback(
    async (mt) => {
      const constraints =
        mt === "video"
          ? {
              audio: true,
              video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            }
          : { audio: true, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      const v = stream.getVideoTracks()[0] || null;
      cameraTrackRef.current = v;
      bindCameraListeners(v);
      return stream;
    },
    [bindCameraListeners]
  );

  const attachLocalToPc = useCallback((pc, stream) => {
    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "video") videoSenderRef.current = sender;
    });
  }, []);

  // ── caller ──
  const startCall = useCallback(
    (to, mt, conversationId) => {
      if (phaseRef.current !== "idle" || !socket) return;
      if (mt !== "audio" && mt !== "video") return;
      setMediaType(mt);
      setPhaseSafe("outgoing");
      setPeer({ _id: to, name: null, photo: null });
      socket.emit("call:start", { to, mediaType: mt, conversationId });
    },
    [socket]
  );

  // ── callee ─
  const acceptCall = useCallback(async () => {
    if (phaseRef.current !== "incoming" || !callIdRef.current || !socket)
      return;
    const id = callIdRef.current;
    try {
      setPhaseSafe("connecting");
      const stream = await acquireLocal(mediaTypeRef.current);
      const pc = pcRef.current || buildPc(iceServersRef.current || []); // ✅ ref, not global
      pc._callId = id;
      pc._peerId = peer?._id;
      attachLocalToPc(pc, stream);
      socket.emit("call:accept", { callId: id });
    } catch (e) {
      const name = e?.name;
      if (name === "NotAllowedError" || name === "NotFoundError")
        toast.error("Camera/mic permission denied", "Call", 4000);
      else toast.error("Could not start call", "Call", 4000);
      socket.emit("call:reject", { callId: id, reason: "declined" });
      teardown();
    }
  }, [peer, socket, acquireLocal, buildPc, attachLocalToPc, teardown, toast]);

  const rejectCall = useCallback(() => {
    if (phaseRef.current !== "incoming" || !callIdRef.current || !socket)
      return;
    socket.emit("call:reject", {
      callId: callIdRef.current,
      reason: "declined",
    });
    teardown();
  }, [socket, teardown]);

  const endCall = useCallback(
    (reason = "hangup") => {
      if (!socket) {
        teardown();
        return;
      }
      if (callIdRef.current)
        socket.emit("call:end", { callId: callIdRef.current, reason });
      teardown();
    },
    [socket, teardown]
  );

  // ── controls ──
  const toggleMute = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    const t = cameraTrackRef.current;
    if (!t) return;
    const next = !videoOff;
    t.enabled = !next;
    setVideoOff(next);
  }, [videoOff]);

  const switchCamera = useCallback(async () => {
    const t = cameraTrackRef.current;
    if (!t || screenSharing) return;
    try {
      const nextFacing =
        t.getSettings().facingMode === "environment" ? "user" : "environment";
      const ns = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing },
      });
      const nt = ns.getVideoTracks()[0];
      t.stop();
      if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(nt);
      cameraTrackRef.current = nt;
      bindCameraListeners(nt); // ✅ re-attach so the off-indicator still works after a switch
      const s = localStreamRef.current;
      if (s) {
        const oldV = s.getVideoTracks()[0];
        if (oldV) s.removeTrack(oldV);
        s.addTrack(nt);
        setLocalStream(new MediaStream(s.getTracks()));
      }
    } catch {
      toast.error("Camera switch unavailable", "Call", 3000);
    }
  }, [screenSharing, toast, bindCameraListeners]);

  const toggleScreenShare = useCallback(async () => {
    if (!SUPPORTS_DISPLAYMEDIA) {
      toast.error("Screen share not supported here", "Call", 3000);
      return;
    }
    if (screenSharing) {
      if (videoSenderRef.current && cameraTrackRef.current)
        await videoSenderRef.current
          .replaceTrack(cameraTrackRef.current)
          .catch(() => {});
      if (screenTrackRef.current) screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
      return;
    }
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const dt = ds.getVideoTracks()[0];
      screenTrackRef.current = dt;
      dt.addEventListener("ended", () => {
        if (videoSenderRef.current && cameraTrackRef.current)
          videoSenderRef.current
            .replaceTrack(cameraTrackRef.current)
            .catch(() => {});
        screenTrackRef.current = null;
        setScreenSharing(false);
      });
      if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(dt);
      setScreenSharing(true);
    } catch {
      /* user cancelled picker */
    }
  }, [screenSharing, toast]);

  // ── socket listeners ──
  useEffect(() => {
    if (!socket) return;

    const onReady = ({ callId: id, iceServers, to }) => {
      iceServersRef.current = iceServers || []; // ✅
      const pc = buildPc(iceServersRef.current);
      pc._callId = id;
      pc._peerId = to;
      setCallId(id);
    };
    const onAccepted = async ({ callId: id }) => {
      if (phaseRef.current !== "outgoing" || id !== callIdRef.current) return;
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
        socket.emit("call:signal", {
          callId: id,
          to: pc._peerId,
          sdp: pc.localDescription,
        });
        setPhaseSafe("connecting");
      } catch (e) {
        const name = e?.name;
        if (name === "NotAllowedError" || name === "NotFoundError")
          toast.error("Camera/mic permission denied", "Call", 4000);
        socket.emit("call:end", { callId: id, reason: "error" });
        teardown();
      }
    };
    const onRing = ({ callId: id, from, mediaType: mt, iceServers }) => {
      if (phaseRef.current !== "idle") {
        socket.emit("call:reject", { callId: id, reason: "busy" });
        return;
      }
      iceServersRef.current = iceServers || []; // ✅
      setCallId(id);
      setPeer(from);
      setMediaType(mt);
      setPhaseSafe("incoming");
      const pc = buildPc(iceServersRef.current);
      pc._callId = id;
      pc._peerId = from?._id;
    };
    const onDismiss = ({ callId: id }) => {
      // a sibling tab accepted; clear OUR stale ring only if we're still ringing this call
      if (phaseRef.current === "incoming" && id === callIdRef.current)
        teardown();
    };
    const onRejected = ({ reason }) => {
      toast.info(
        reason === "busy" ? "They're on another call" : "Call declined",
        "Call",
        3000
      );
      teardown();
    };
    const onEnded = ({ reason, status, durationMs }) => {
      const label =
        status === "missed"
          ? "Missed call"
          : reason === "blocked"
          ? "Call ended (blocked)"
          : reason === "unmatched"
          ? "Call ended"
          : reason === "inactive"
          ? "Call ended"
          : "Call ended";
      if (durationMs > 0)
        toast.info(`${label} · ${fmt(durationMs)}`, "Call", 3000);
      else toast.info(label, "Call", 3000);
      teardown();
    };
    const onBusy = () => {
      toast.warning("You're already in a call", "Call", 3000);
      teardown();
    };
    const onSignal = async ({ callId: id, from, sdp, candidate }) => {
      if (id !== callIdRef.current) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          remoteDescSetRef.current = true;
          await flushPendingCandidates(pc);
          if (sdp.type === "offer" && phaseRef.current === "connecting") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("call:signal", {
              callId: id,
              to: from,
              sdp: pc.localDescription,
            });
          }
        } catch (e) {
          console.error("setRemoteDescription failed", e);
        }
      } else if (candidate) {
        if (remoteDescSetRef.current) {
          try {
            await pc.addIceCandidate(candidate);
          } catch {}
        } else pendingCandidatesRef.current.push(candidate);
      }
    };
    const onError = ({ message }) => {
      toast.error(message || "Call error", "Call", 4000);
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
    toast,
  ]);

  // hard cleanup on unmount
  useEffect(
    () => () => {
      if (callIdRef.current && socket)
        socket.emit("call:end", {
          callId: callIdRef.current,
          reason: "disconnected",
        });
      teardown();
    },
    [socket, teardown]
  );

  return {
    phase,
    callId,
    peer,
    mediaType,
    localStream,
    remoteStream,
    muted,
    videoOff,
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
