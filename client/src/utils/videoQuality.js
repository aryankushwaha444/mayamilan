/**
 * WebRTC video/audio quality helpers.
 *
 * Goals:
 * - Request real camera resolution instead of browser default low quality.
 * - Force higher encoder bitrate for video/audio senders.
 * - Provide stats logging to identify whether issue is CPU, bandwidth, TURN, or camera.
 */

import { sanitizeIceServers, isWebRtcDebugEnabled } from "./webrtcSecurity.js";

const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent || "");

export const VIDEO_QUALITY_PRESETS = {
  low: {
    id: "low",
    width: 640,
    height: 480,
    frameRate: 24,
    videoMaxBitrate: 800_000,
    audioMaxBitrate: 48_000,
    degradationPreference: "maintain-framerate",
    contentHint: "motion",
  },
  mobile720: {
    id: "mobile720",
    width: 1280,
    height: 720,
    frameRate: 30,
    videoMaxBitrate: 1_800_000,
    audioMaxBitrate: 64_000,
    degradationPreference: "balanced",
    contentHint: "motion",
  },
  hd720: {
    id: "hd720",
    width: 1280,
    height: 720,
    frameRate: 30,
    videoMaxBitrate: 2_500_000,
    audioMaxBitrate: 96_000,
    degradationPreference: "balanced",
    contentHint: "motion",
  },
  fullHd1080: {
    id: "fullHd1080",
    width: 1920,
    height: 1080,
    frameRate: 30,
    videoMaxBitrate: 4_500_000,
    audioMaxBitrate: 128_000,
    degradationPreference: "balanced",
    contentHint: "motion",
  },
};

export const getDefaultPreset = () => {
  if (IS_MOBILE) return VIDEO_QUALITY_PRESETS.mobile720;
  return VIDEO_QUALITY_PRESETS.hd720;
};

export const getPresetById = (id) => {
  return VIDEO_QUALITY_PRESETS[id] || getDefaultPreset();
};

/**
 * Use this instead of:
 * navigator.mediaDevices.getUserMedia({ video: true, audio: true })
 */
export const getMediaConstraints = (preset = getDefaultPreset()) => ({
  video: {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: {
      ideal: preset.frameRate,
      max: preset.frameRate,
    },
    facingMode: "user",
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  },
});

/**
 * Create RTCPeerConnection with settings favorable for quality.
 */
export const createHighQualityPeerConnection = (iceServers = []) => {
  return new RTCPeerConnection({
    iceServers: sanitizeIceServers(iceServers),
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
};

/**
 * Apply high quality to a video RTCRtpSender.
 */
export async function applyVideoSenderQuality(
  sender,
  preset = getDefaultPreset()
) {
  if (!sender || sender.track?.kind !== "video") return;

  try {
    if ("contentHint" in sender.track) {
      sender.track.contentHint = preset.contentHint || "motion";
    }

    const params = sender.getParameters();

    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const topIndex = params.encodings.length - 1;

    params.encodings = params.encodings.map((enc, index) => {
      const isTopLayer = index === topIndex;
      const divisor = isTopLayer ? 1 : Math.pow(2, topIndex - index);

      return {
        ...enc,
        maxBitrate: Math.round(preset.videoMaxBitrate / divisor),
        maxFrameRate: preset.frameRate,
        scaleResolutionDownBy:
          enc.scaleResolutionDownBy ?? (isTopLayer ? 1 : divisor),
      };
    });

    params.degradationPreference = preset.degradationPreference || "balanced";

    await sender.setParameters(params);
  } catch (err) {
    if (isWebRtcDebugEnabled()) {
      console.warn("applyVideoSenderQuality failed:", err?.message || err);
    }
  }
}

/**
 * Apply quality to audio sender.
 */
export async function applyAudioSenderQuality(
  sender,
  preset = getDefaultPreset()
) {
  if (!sender || sender.track?.kind !== "audio") return;

  try {
    const params = sender.getParameters();

    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    params.encodings = params.encodings.map((enc) => ({
      ...enc,
      maxBitrate: preset.audioMaxBitrate,
    }));

    await sender.setParameters(params);
  } catch (err) {
    if (isWebRtcDebugEnabled()) {
      console.warn("applyAudioSenderQuality failed:", err?.message || err);
    }
  }
}

/**
 * Apply quality to all current senders on a peer connection.
 */
export async function applyAllSendersQuality(pc, preset = getDefaultPreset()) {
  if (!pc) return;

  const senders = pc.getSenders();

  await Promise.all(
    senders.map(async (sender) => {
      if (sender.track?.kind === "video") {
        await applyVideoSenderQuality(sender, preset);
      } else if (sender.track?.kind === "audio") {
        await applyAudioSenderQuality(sender, preset);
      }
    })
  );
}

/**
 * Codec preference.
 *
 * SECURITY/ROBUSTNESS FIX (#1): RTX ("/rtx") and FEC ("/fec","flexfec") codecs
 * MUST remain immediately after their parent media codec (linked by
 * parameters.apt). A naive full-array sort produces an INVALID order which can
 * make setCodecPreferences throw or break negotiation (one-way media /
 * "auto-cancel"). We therefore score+sort ONLY the media codecs and re-attach
 * each auxiliary codec right after its parent.
 *
 * Modes:
 * - "compatible": prefer H264/VP8 (hardware/mobile stable)  <- default
 * - "efficient":  prefer VP9/AV1 (better compression, more CPU)
 */
export function preferVideoCodec(transceiver, mode = "compatible") {
  try {
    if (!transceiver || typeof transceiver.setCodecPreferences !== "function") {
      return;
    }

    const capabilities = RTCRtpReceiver.getCapabilities?.("video");
    const all = capabilities?.codecs || [];
    if (!all.length) return;

    const mimeOf = (c) => String(c?.mimeType || "").toLowerCase();
    const isAux = (c) => {
      const m = mimeOf(c);
      return m.endsWith("/rtx") || m.endsWith("/fec") || m === "video/flexfec";
    };

    const media = all.filter((c) => !isAux(c));
    const aux = all.filter(isAux);
    if (!media.length) return; // nothing to order

    const score = (c) => {
      const m = mimeOf(c);
      if (mode === "efficient") {
        if (m.includes("av1")) return 5;
        if (m.includes("vp9")) return 4;
        if (m.includes("vp8")) return 3;
        if (m.includes("h264")) return 2;
        return 1;
      }
      if (m.includes("h264")) return 5;
      if (m.includes("vp8")) return 4;
      if (m.includes("vp9")) return 3;
      if (m.includes("av1")) return 2;
      return 1;
    };

    media.sort((a, b) => score(b) - score(a));

    const ordered = [];
    const usedAux = new Set();

    for (const m of media) {
      ordered.push(m);
      const pt = String(m.payloadType);
      for (const a of aux) {
        if (usedAux.has(a)) continue;
        const apt = a?.parameters?.apt ?? a?.apt;
        if (apt != null && String(apt) === pt) {
          ordered.push(a);
          usedAux.add(a);
        }
      }
    }
    // Any auxiliary codec whose parent was filtered out (rare) goes last so we
    // never DROP a codec the remote might require.
    for (const a of aux) if (!usedAux.has(a)) ordered.push(a);

    transceiver.setCodecPreferences(ordered);
  } catch (err) {
    if (isWebRtcDebugEnabled()) {
      console.warn("preferVideoCodec failed:", err?.message || err);
    }
  }
}

/**
 * Bind quality application to peer connection lifecycle.
 */
export function bindQualityToPeerConnection(pc, preset = getDefaultPreset()) {
  if (!pc) return () => {};

  const apply = () => {
    applyAllSendersQuality(pc, preset).catch(() => {});
  };

  const onNegotiationNeeded = () => {
    setTimeout(apply, 100);
  };

  const onTrack = () => {
    setTimeout(apply, 100);
  };

  pc.addEventListener("negotiationneeded", onNegotiationNeeded);
  pc.addEventListener("track", onTrack);

  apply();

  return () => {
    pc.removeEventListener("negotiationneeded", onNegotiationNeeded);
    pc.removeEventListener("track", onTrack);
  };
}

/**
 * Log actual camera settings after getUserMedia.
 * Production-safe: only logs when debug mode is enabled.
 */
export async function logLocalMediaSettings(stream) {
  if (!isWebRtcDebugEnabled()) return;

  try {
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    const videoSettings = videoTrack?.getSettings?.() || {};
    const audioSettings = audioTrack?.getSettings?.() || {};

    console.log("🎥 Local video settings:", {
      deviceId: videoSettings.deviceId,
      width: videoSettings.width,
      height: videoSettings.height,
      frameRate: videoSettings.frameRate,
      facingMode: videoSettings.facingMode,
      aspectRatio: videoSettings.aspectRatio,
    });

    console.log("🎤 Local audio settings:", {
      deviceId: audioSettings.deviceId,
      sampleRate: audioSettings.sampleRate,
      channelCount: audioSettings.channelCount,
      echoCancellation: audioSettings.echoCancellation,
      noiseSuppression: audioSettings.noiseSuppression,
      autoGainControl: audioSettings.autoGainControl,
    });
  } catch (err) {
    console.warn("logLocalMediaSettings failed:", err?.message || err);
  }
}

/**
 * Start WebRTC stats monitor.
 * Production-safe: disabled unless debug mode is enabled.
 */
export function startWebRtcStatsMonitor(pc, intervalMs = 3000) {
  if (!pc) return () => {};
  if (!isWebRtcDebugEnabled()) return () => {};

  const lastOutbound = new Map();
  const lastInbound = new Map();

  const timer = setInterval(async () => {
    try {
      const report = await pc.getStats();

      const candidates = new Map();

      report.forEach((r) => {
        if (r.type === "local-candidate" || r.type === "remote-candidate") {
          candidates.set(r.id, r);
        }
      });

      report.forEach((r) => {
        if (r.type === "outbound-rtp" && r.kind === "video") {
          const prev = lastOutbound.get(r.id);

          lastOutbound.set(r.id, {
            bytesSent: r.bytesSent,
            timestamp: r.timestamp,
          });

          let bitrateKbps = 0;

          if (prev && r.timestamp > prev.timestamp) {
            const bytesDelta = r.bytesSent - prev.bytesSent;
            const msDelta = r.timestamp - prev.timestamp;
            bitrateKbps = Math.round(
              (bytesDelta * 8) / (msDelta / 1000) / 1000
            );
          }

          console.log("📤 Video outbound:", {
            bitrateKbps,
            frameWidth: r.frameWidth,
            frameHeight: r.frameHeight,
            framesPerSecond: r.framesPerSecond,
            framesEncoded: r.framesEncoded,
            framesDropped: r.framesDropped,
            packetsSent: r.packetsSent,
            qualityLimitationReason: r.qualityLimitationReason,
            qualityLimitationResolutionChanges:
              r.qualityLimitationResolutionChanges,
          });
        }

        if (r.type === "inbound-rtp" && r.kind === "video") {
          const prev = lastInbound.get(r.id);

          lastInbound.set(r.id, {
            bytesReceived: r.bytesReceived,
            timestamp: r.timestamp,
          });

          let bitrateKbps = 0;

          if (prev && r.timestamp > prev.timestamp) {
            const bytesDelta = r.bytesReceived - prev.bytesReceived;
            const msDelta = r.timestamp - prev.timestamp;
            bitrateKbps = Math.round(
              (bytesDelta * 8) / (msDelta / 1000) / 1000
            );
          }

          console.log("📥 Video inbound:", {
            bitrateKbps,
            frameWidth: r.frameWidth,
            frameHeight: r.frameHeight,
            framesPerSecond: r.framesPerSecond,
            framesDecoded: r.framesDecoded,
            framesDropped: r.framesDropped,
            framesCorrupted: r.framesCorrupted,
            packetsReceived: r.packetsReceived,
            packetsLost: r.packetsLost,
            jitter: r.jitter,
            nackCount: r.nackCount,
            pliCount: r.pliCount,
            firCount: r.firCount,
          });
        }

        if (r.type === "outbound-rtp" && r.kind === "audio") {
          console.log("📤 Audio outbound:", {
            packetsSent: r.packetsSent,
            bytesSent: r.bytesSent,
            targetBitrate: r.targetBitrate,
          });
        }

        if (r.type === "inbound-rtp" && r.kind === "audio") {
          console.log("📥 Audio inbound:", {
            packetsReceived: r.packetsReceived,
            packetsLost: r.packetsLost,
            jitter: r.jitter,
            audioLevel: r.audioLevel,
          });
        }

        if (r.type === "candidate-pair" && (r.nominated || r.selected)) {
          const local = candidates.get(r.localCandidateId);
          const remote = candidates.get(r.remoteCandidateId);

          console.log("🧊 ICE selected candidate pair:", {
            state: r.state,
            currentRoundTripTime: r.currentRoundTripTime,
            availableOutgoingBitrate: r.availableOutgoingBitrate,
            localCandidateType: local?.candidateType,
            remoteCandidateType: remote?.candidateType,
            localProtocol: local?.protocol,
            remoteProtocol: remote?.protocol,
            usingRelay:
              local?.candidateType === "relay" ||
              remote?.candidateType === "relay",
          });
        }
      });
    } catch (err) {
      console.warn("WebRTC stats monitor error:", err?.message || err);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
