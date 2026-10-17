// src/hooks/useCall.ts
//
// Faithful mobile port of the read backend/web call contract.
//
// SECURITY:
//  - all socket payloads are validated through callSecurity.ts
//  - ICE servers are sanitized through webrtcSecurity.ts
//  - remote SDP is fail-closed through gateSdp/assertEncryptedSdp
//  - ICE candidates are structurally validated
//  - incoming caller metadata/photo is sanitized and media-allowlisted
//  - mobile never sends duration
//  - mobile never trusts route.params for live call state
//
// NATIVE:
//  - react-native-webrtc static import is compiler-probed
//  - expo-audio is used for mic permission + call audio mode
//  - react-native-incall-manager is lazily required and guarded
//  - expo-image-picker is lazily required for camera permission and guarded

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from "react-native-webrtc";

import {
  setAudioModeAsync,
  setIsAudioActiveAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";

import { useSocket } from "../context/SocketContext";
import { useAlert } from "../context/AlertContext";
import { isObjectId } from "../utils/media";
import { sanitizeIceServers } from "../utils/webrtcSecurity";

import {
  sanitizeCallId,
  sanitizePeer,
  sanitizeErrorMessage,
  sanitizeMediaType,
  gateSdp,
  sanitizeIceCandidate,
  mapRejectedStatus,
  mapEndedStatus,
  callStatusLabel,
  type SafePeer,
  type CallUiStatus,
  type CallMediaType,
  type IceCandidateInit,
} from "../utils/callSecurity";

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "connected";

const MAX_PENDING_CANDIDATES = 100;
const OUTGOING_NO_ANSWER_MS = 30_000;

const SAFE_END_REASONS = new Set([
  "hangup",
  "declined",
  "missed",
  "timeout",
  "disconnected",
  "busy",
  "blocked",
  "unmatched",
  "inactive",
  "error",
]);

const getInCallManager = (): any => {
  try {
    return require("react-native-incall-manager");
  } catch {
    return null;
  }
};

const getImagePicker = (): any => {
  try {
    return require("expo-image-picker");
  } catch {
    return null;
  }
};

export function useCall() {
  const { socket } = useSocket();
  const toast = useAlert();

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<CallUiStatus>("idle");
  const [callId, setCallId] = useState<string | null>(null);
  const [peer, setPeer] = useState<SafePeer | null>(null);
  const [mediaType, setMediaType] = useState<CallMediaType>("audio");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [videoOff, setVideoOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef(socket);
  const toastRef = useRef(toast);

  const phaseRef = useRef<Phase>("idle");
  const callIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const mediaTypeRef = useRef<CallMediaType>("audio");
  const isCallerRef = useRef(false);
  const isSpeakerRef = useRef(true);

  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingLocalStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<IceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const connectedEmittedRef = useRef(false);

  const secondsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(true);
  const endCallRef = useRef<(reason?: string) => Promise<void> | void>(
    () => {}
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    isSpeakerRef.current = isSpeaker;
  }, [isSpeaker]);

  const setPhaseSafe = useCallback((p: Phase) => {
    phaseRef.current = p;
    if (mountedRef.current) setPhase(p);
  }, []);

  const setStatusSafe = useCallback((s: CallUiStatus) => {
    if (mountedRef.current) setStatus(s);
  }, []);

  const setCallIdSync = useCallback((id: string | null) => {
    callIdRef.current = id;
    if (mountedRef.current) setCallId(id);
  }, []);

  const clearSecondsTimer = useCallback(() => {
    if (secondsTimerRef.current) {
      clearInterval(secondsTimerRef.current);
      secondsTimerRef.current = null;
    }
  }, []);

  const clearNoAnswerTimer = useCallback(() => {
    if (noAnswerTimerRef.current) {
      clearTimeout(noAnswerTimerRef.current);
      noAnswerTimerRef.current = null;
    }
  }, []);

  const startSecondsTimer = useCallback(() => {
    clearSecondsTimer();
    secondsTimerRef.current = setInterval(() => {
      if (mountedRef.current) setSeconds((s) => s + 1);
    }, 1000);
  }, [clearSecondsTimer]);

  const stopStream = useCallback((stream: any) => {
    try {
      stream?.getTracks?.().forEach((t: any) => {
        try {
          t.stop();
        } catch {}
      });
    } catch {}
  }, []);

  const resetAudio = useCallback(async () => {
    try {
      await setIsAudioActiveAsync(false);
    } catch {}

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: "mixWithOthers",
      } as any);
    } catch {}

    const icm = getInCallManager();

    try {
      icm?.stop?.();
    } catch {}

    try {
      icm?.keepAwake?.(false);
    } catch {}
  }, []);

  const configureAudio = useCallback(
    async (mt: CallMediaType, speaker: boolean) => {
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          shouldRouteThroughEarpiece: !speaker,
          interruptionMode: "doNotMix",
        } as any);
      } catch {}

      try {
        await setIsAudioActiveAsync(true);
      } catch {}

      const icm = getInCallManager();

      try {
        icm?.start?.({ media: mt === "video" ? "video" : "audio" });
      } catch {}

      try {
        icm?.keepAwake?.();
      } catch {}

      try {
        icm?.setSpeakerphoneOn?.(speaker);
      } catch {}
    },
    []
  );

  const ensurePermissions = useCallback(async (mt: CallMediaType) => {
    const mic = await requestRecordingPermissionsAsync();
    if (!mic.granted) {
      throw new Error("Microphone permission denied");
    }

    if (mt === "video") {
      const picker = getImagePicker();
      try {
        await picker?.requestCameraPermissionsAsync?.();
      } catch {}
    }
  }, []);

  const acquireLocal = useCallback(
    async (mt: CallMediaType): Promise<MediaStream> => {
      await ensurePermissions(mt);
      await configureAudio(mt, isSpeakerRef.current);

      let stream: any = null;

      if (mt === "video") {
        try {
          stream = await mediaDevices.getUserMedia({
            audio: true,
            video: { facingMode: "user" },
          } as any);

          if (!stream.getVideoTracks().length) {
            stopStream(stream);
            stream = await mediaDevices.getUserMedia({
              audio: true,
              video: false,
            } as any);

            mediaTypeRef.current = "audio";
            if (mountedRef.current) setMediaType("audio");
            if (mountedRef.current) setVideoOff(true);
          }
        } catch {
          stream = await mediaDevices.getUserMedia({
            audio: true,
            video: false,
          } as any);

          mediaTypeRef.current = "audio";
          if (mountedRef.current) setMediaType("audio");
          if (mountedRef.current) setVideoOff(true);
        }
      } else {
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        } as any);
      }

      if (!stream) throw new Error("No media stream");

      localStreamRef.current = stream;
      if (mountedRef.current) setLocalStream(stream);

      return stream;
    },
    [configureAudio, ensurePermissions, stopStream]
  );

  const emit = useCallback((event: string, payload?: any) => {
    try {
      socketRef.current?.emit(event, payload);
    } catch {}
  }, []);

  const emitSignal = useCallback(
    (payload: any) => {
      emit("call:signal", payload);
    },
    [emit]
  );

  const teardown = useCallback(async () => {
    clearSecondsTimer();
    clearNoAnswerTimer();

    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    connectedEmittedRef.current = false;

    const pc = pcRef.current;
    pcRef.current = null;

    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onnegotiationneeded = null;
      } catch {}

      try {
        pc.close();
      } catch {}
    }

    stopStream(localStreamRef.current);
    stopStream(pendingLocalStreamRef.current);

    localStreamRef.current = null;
    pendingLocalStreamRef.current = null;

    callIdRef.current = null;
    peerIdRef.current = null;
    isCallerRef.current = false;

    if (mountedRef.current) {
      setLocalStream(null);
      setRemoteStream(null);
      setCallId(null);
      setPeer(null);
      setSeconds(0);
      setIsMuted(false);
      setVideoOff(false);
    }

    await resetAudio();

    setPhaseSafe("idle");
  }, [
    clearNoAnswerTimer,
    clearSecondsTimer,
    resetAudio,
    setPhaseSafe,
    stopStream,
  ]);

  const finalize = useCallback(
    (s: CallUiStatus) => {
      setStatusSafe(s);
      setPhaseSafe("idle");

      const label = callStatusLabel(s, {
        isVideo: mediaTypeRef.current === "video",
        seconds: 0,
      });

      if (s !== "idle") {
        try {
          toastRef.current?.info?.(label);
        } catch {}
      }
    },
    [setPhaseSafe, setStatusSafe]
  );

  const endCall = useCallback(
    async (reason = "hangup") => {
      if (phaseRef.current === "idle") {
        await teardown();
        return;
      }

      const cid = callIdRef.current;
      const safeReason = SAFE_END_REASONS.has(reason) ? reason : "hangup";

      if (cid) {
        emit("call:end", { callId: cid, reason: safeReason });
      }

      const st: CallUiStatus =
        safeReason === "timeout"
          ? "no-answer"
          : safeReason === "declined"
          ? "declined"
          : safeReason === "error"
          ? "failed"
          : phaseRef.current === "outgoing" && !cid
          ? "canceled"
          : "ended";

      finalize(st);
      await teardown();
    },
    [emit, finalize, teardown]
  );

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  const attachLocalCanonical = useCallback((pc: any, stream: any) => {
    const addTrack = (track: any) => {
      if (!track) return;

      if (typeof pc.addTransceiver === "function") {
        pc.addTransceiver(track, {
          direction: "sendrecv",
          streams: [stream],
        } as any);
      } else if (typeof pc.addTrack === "function") {
        pc.addTrack(track, stream);
      }
    };

    const audio = stream.getAudioTracks?.()[0];
    const video = stream.getVideoTracks?.()[0];

    addTrack(audio);
    addTrack(video);
  }, []);

  const attachToOfferedTransceivers = useCallback(
    async (pc: any, stream: any) => {
      const tracks = stream.getTracks?.() || [];
      const transceivers =
        typeof pc.getTransceivers === "function" ? pc.getTransceivers() : [];

      const addTrack = (track: any) => {
        if (!track) return;

        if (typeof pc.addTransceiver === "function") {
          pc.addTransceiver(track, {
            direction: "sendrecv",
            streams: [stream],
          } as any);
        } else if (typeof pc.addTrack === "function") {
          pc.addTrack(track, stream);
        }
      };

      for (const track of tracks) {
        let tr = transceivers.find(
          (t: any) =>
            t?.receiver?.track?.kind === track.kind &&
            t?.direction !== "inactive" &&
            !t?.sender?.track
        );

        if (!tr) {
          tr = transceivers.find(
            (t: any) =>
              t?.receiver?.track?.kind === track.kind &&
              t?.direction !== "inactive"
          );
        }

        if (tr) {
          try {
            tr.direction = "sendrecv";
          } catch {}

          if (tr.sender) {
            try {
              await tr.sender.replaceTrack(track);
              continue;
            } catch {}
          }

          addTrack(track);
        } else {
          addTrack(track);
        }
      }
    },
    []
  );

  const flushPendingCandidates = useCallback(async (pc: any) => {
    const list = pendingCandidatesRef.current.splice(0, MAX_PENDING_CANDIDATES);

    for (const c of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c as any));
      } catch {}
    }
  }, []);

  const buildPc = useCallback(
    (iceServers: any[]) => {
      const pc = new RTCPeerConnection({
        iceServers: sanitizeIceServers(iceServers),
      } as any);

      pc.onicecandidate = (e: any) => {
        const candidate = e?.candidate?.toJSON?.();
        if (!candidate) return;
        if (!callIdRef.current || !peerIdRef.current) return;

        emitSignal({
          callId: callIdRef.current,
          to: peerIdRef.current,
          candidate,
        });
      };

      pc.ontrack = (e: any) => {
        const stream =
          e?.streams?.[0] || (e?.track ? new MediaStream([e.track]) : null);

        if (stream && mountedRef.current) {
          setRemoteStream(stream);
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;

        if (st === "connected") {
          if (!connectedEmittedRef.current && callIdRef.current) {
            connectedEmittedRef.current = true;
            emit("call:connected", { callId: callIdRef.current });
            startSecondsTimer();
          }

          setPhaseSafe("connected");
          setStatusSafe("connected");
        } else if (st === "failed") {
          void endCallRef.current?.("error");
        }
      };

      return pc;
    },
    [emit, emitSignal, setPhaseSafe, setStatusSafe, startSecondsTimer]
  );

  const establishCallerMedia = useCallback(
    async (pc: any, cid: string) => {
      const stream = await acquireLocal(mediaTypeRef.current);
      attachLocalCanonical(pc, stream);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mediaTypeRef.current === "video",
      } as any);

      await pc.setLocalDescription(offer);

      const desc = pc.localDescription;
      if (desc && peerIdRef.current) {
        emitSignal({
          callId: cid,
          to: peerIdRef.current,
          sdp: desc,
        });
      }
    },
    [acquireLocal, attachLocalCanonical, emitSignal]
  );

  const startCall = useCallback(
    async (to: string, mt: CallMediaType, conversationId?: string) => {
      if (phaseRef.current !== "idle") return;

      const safeTo = isObjectId(to) ? to : null;
      if (!safeTo) return;

      const safeMt = sanitizeMediaType(mt) || "audio";

      mediaTypeRef.current = safeMt;
      isCallerRef.current = true;
      peerIdRef.current = safeTo;

      setError(null);
      setMediaType(safeMt);
      setPeer({ _id: safeTo, name: null, photo: null });
      setPhaseSafe("outgoing");
      setStatusSafe("outgoing");

      emit("call:start", {
        to: safeTo,
        mediaType: safeMt,
        conversationId:
          conversationId && isObjectId(conversationId)
            ? conversationId
            : undefined,
      });

      clearNoAnswerTimer();
      noAnswerTimerRef.current = setTimeout(() => {
        if (phaseRef.current !== "outgoing") return;

        if (callIdRef.current) {
          emit("call:end", {
            callId: callIdRef.current,
            reason: "timeout",
          });
        }

        finalize("no-answer");
        void teardown();
      }, OUTGOING_NO_ANSWER_MS);
    },
    [clearNoAnswerTimer, emit, finalize, setPhaseSafe, setStatusSafe, teardown]
  );

  const acceptCall = useCallback(async () => {
    if (
      phaseRef.current !== "incoming" ||
      !callIdRef.current ||
      !peerIdRef.current
    )
      return;

    setPhaseSafe("connecting");
    setStatusSafe("connecting");

    try {
      const stream = await acquireLocal(mediaTypeRef.current);
      pendingLocalStreamRef.current = stream;

      emit("call:accept", { callId: callIdRef.current });
    } catch (e: any) {
      const msg = sanitizeErrorMessage(e?.message);
      setError(msg);

      if (callIdRef.current) {
        emit("call:reject", {
          callId: callIdRef.current,
          reason: "declined",
        });
      }

      finalize("failed");
      await teardown();
    }
  }, [acquireLocal, emit, finalize, setPhaseSafe, setStatusSafe, teardown]);

  const rejectCall = useCallback(() => {
    if (phaseRef.current !== "incoming" || !callIdRef.current) return;

    emit("call:reject", {
      callId: callIdRef.current,
      reason: "declined",
    });

    finalize("declined");
    void teardown();
  }, [emit, finalize, teardown]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const next = !m;
      localStreamRef.current?.getAudioTracks?.().forEach((t: any) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setVideoOff((v) => {
      const next = !v;
      localStreamRef.current?.getVideoTracks?.().forEach((t: any) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeaker((s) => {
      const next = !s;
      isSpeakerRef.current = next;

      const icm = getInCallManager();
      try {
        icm?.setSpeakerphoneOn?.(next);
      } catch {}

      void setAudioModeAsync({
        allowsRecording: true,
        shouldRouteThroughEarpiece: !next,
        interruptionMode: "doNotMix",
      } as any).catch(() => {});

      return next;
    });
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onReady = (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);
      const to = typeof payload?.to === "string" ? payload.to : null;
      const mt = sanitizeMediaType(payload?.mediaType);
      const ice = payload?.iceServers;

      if (!cid || !to || !isObjectId(to) || !mt) return;
      if (phaseRef.current !== "outgoing") return;
      if (pcRef.current) return;

      callIdRef.current = cid;
      peerIdRef.current = to;
      mediaTypeRef.current = mt;
      isCallerRef.current = true;

      setCallIdSync(cid);
      setMediaType(mt);
      setPeer({ _id: to, name: null, photo: null });

      const pc = buildPc(ice);
      pcRef.current = pc;
    };

    const onAccepted = async (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);

      if (!cid || cid !== callIdRef.current) return;
      if (phaseRef.current !== "outgoing") return;

      clearNoAnswerTimer();
      setPhaseSafe("connecting");
      setStatusSafe("connecting");

      const pc = pcRef.current;
      if (!pc) return;

      try {
        await establishCallerMedia(pc, cid);
      } catch (e: any) {
        setError(sanitizeErrorMessage(e?.message));
        await endCallRef.current?.("error");
      }
    };

    const onRing = (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);
      const from = sanitizePeer(payload?.from);
      const mt = sanitizeMediaType(payload?.mediaType);
      const ice = payload?.iceServers;

      if (!cid || !from || !mt) {
        if (cid) emit("call:reject", { callId: cid, reason: "busy" });
        return;
      }

      if (phaseRef.current !== "idle") {
        emit("call:reject", { callId: cid, reason: "busy" });
        return;
      }

      callIdRef.current = cid;
      peerIdRef.current = from._id;
      mediaTypeRef.current = mt;
      isCallerRef.current = false;

      setCallIdSync(cid);
      setPeer(from);
      setMediaType(mt);
      setError(null);
      setPhaseSafe("incoming");
      setStatusSafe("incoming");

      try {
        const pc = buildPc(ice);
        pcRef.current = pc;
      } catch {
        emit("call:reject", { callId: cid, reason: "busy" });
        finalize("failed");
        void teardown();
      }
    };

    const onDismiss = (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);

      if (phaseRef.current === "incoming" && cid && cid === callIdRef.current) {
        finalize("canceled");
        void teardown();
      }
    };

    const onRejected = (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return;

      finalize(mapRejectedStatus(payload?.reason));
      void teardown();
    };

    const onEnded = (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return;

      finalize(mapEndedStatus(payload));
      void teardown();
    };

    const onBusy = () => {
      if (phaseRef.current !== "outgoing") return;

      finalize("busy");
      void teardown();
    };

    const onSignal = async (payload: any) => {
      const cid = sanitizeCallId(payload?.callId);
      if (!cid || cid !== callIdRef.current) return;

      const pc = pcRef.current;
      if (!pc) return;

      const rawFrom = payload?.from;
      const fromId =
        typeof rawFrom === "string"
          ? rawFrom
          : rawFrom && typeof rawFrom === "object"
          ? rawFrom._id
          : null;

      if (!fromId || !isObjectId(fromId)) return;
      if (peerIdRef.current && String(fromId) !== peerIdRef.current) return;

      if (payload?.sdp) {
        const sdpObj = payload.sdp;

        if (
          !sdpObj ||
          typeof sdpObj !== "object" ||
          typeof sdpObj.sdp !== "string" ||
          !["offer", "answer"].includes(sdpObj.type)
        )
          return;

        if (!gateSdp(sdpObj.sdp)) return;

        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({
              type: sdpObj.type,
              sdp: sdpObj.sdp,
            } as any)
          );

          remoteDescSetRef.current = true;

          await flushPendingCandidates(pc);

          if (pendingLocalStreamRef.current) {
            await attachToOfferedTransceivers(
              pc,
              pendingLocalStreamRef.current
            );
            pendingLocalStreamRef.current = null;
          }

          if ((pc as any).signalingState === "have-remote-offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const desc = pc.localDescription;
            if (desc && peerIdRef.current) {
              emitSignal({
                callId: cid,
                to: peerIdRef.current,
                sdp: desc,
              });
            }
          }
        } catch (e) {
          console.warn("setRemoteDescription failed", e);
        }
      } else if (payload?.candidate) {
        const clean = sanitizeIceCandidate(payload.candidate);
        if (!clean) return;

        if (remoteDescSetRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(clean as any));
          } catch {}
        } else if (
          pendingCandidatesRef.current.length < MAX_PENDING_CANDIDATES
        ) {
          pendingCandidatesRef.current.push(clean);
        }
      }
    };

    const onError = (payload: any) => {
      const msg = sanitizeErrorMessage(payload?.message);
      setError(msg);

      if (phaseRef.current !== "idle") {
        finalize("failed");
        void teardown();
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
    attachToOfferedTransceivers,
    buildPc,
    clearNoAnswerTimer,
    emit,
    emitSignal,
    establishCallerMedia,
    finalize,
    flushPendingCandidates,
    setCallIdSync,
    setPhaseSafe,
    setStatusSafe,
    socket,
    teardown,
  ]);

  useEffect(() => {
    return () => {
      if (phaseRef.current !== "idle" && callIdRef.current) {
        try {
          socketRef.current?.emit("call:end", {
            callId: callIdRef.current,
            reason: "disconnected",
          });
        } catch {}
      }

      clearSecondsTimer();
      clearNoAnswerTimer();

      const pc = pcRef.current;
      pcRef.current = null;

      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.oniceconnectionstatechange = null;
          pc.onnegotiationneeded = null;
        } catch {}

        try {
          pc.close();
        } catch {}
      }

      stopStream(localStreamRef.current);
      stopStream(pendingLocalStreamRef.current);

      localStreamRef.current = null;
      pendingLocalStreamRef.current = null;

      void resetAudio();
    };
  }, [clearNoAnswerTimer, clearSecondsTimer, resetAudio, stopStream]);

  const statusLabel = callStatusLabel(status, {
    isVideo: mediaType === "video",
    seconds,
  });

  return {
    phase,
    status,
    statusLabel,
    callId,
    peer,
    mediaType,
    localStream,
    remoteStream,
    isMuted,
    isSpeaker,
    videoOff,
    seconds,
    error,

    startCall,
    acceptCall,
    rejectCall,
    endCall,

    toggleMute,
    toggleVideo,
    toggleSpeaker,
  };
}

export type UseCallReturn = ReturnType<typeof useCall>;

export default useCall;
