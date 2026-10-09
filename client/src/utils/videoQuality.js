/**
 * WebRTC video/audio quality helpers.
 *
 * Goals:
 * - Request real camera resolution instead of browser default low quality.
 * - Force higher encoder bitrate for video/audio senders.
 * - Provide stats logging to identify whether issue is CPU, bandwidth, TURN, or camera.
 * - ✅ Add a dependency-free, offline-safe microphone denoiser (high-pass + adaptive
 *   soft gate / downward expander) so steady background noise (fan/AC/keyboard/hiss)
 *   is attenuated WITHOUT relying on a remote model or extra committed files.
 */

import { sanitizeIceServers, isWebRtcDebugEnabled } from "./webrtcSecurity.js";

// ✅ CROSS-BROWSER-FIX: iPadOS 13+ reports a "Macintosh" UA, so the old regex
//    treated an iPad as desktop and handed it the hd720 preset. Detect the
//    touch-capable Mac (standard heuristic) so iPads get the mobile preset.
const UA = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
const IS_TOUCH_MAC =
  typeof navigator !== "undefined" &&
  /Macintosh/.test(UA) &&
  typeof navigator.maxTouchPoints === "number" &&
  navigator.maxTouchPoints > 1 &&
  // window.MSStream existed only on legacy Edge-on-Windows "Mac"-ish UAs; absent elsewhere.
  (typeof window === "undefined" || !window.MSStream);
const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(UA) || IS_TOUCH_MAC;

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
 *
 * ✅ AUDIO CHANGES:
 *  - channelCount / sampleRate are {ideal:...} (NOT exact) so a device that
 *    can't deliver exactly 1ch/48kHz no longer throws OverconstrainedError.
 *  - 🔒 CROSS-BROWSER-FIX: the Chromium-only `advanced` goog* block is NO LONGER in
 *    the default constraints. The three top-level booleans already engage native
 *    NS/EC/AGC on EVERY browser; the goog* keys were a Chrome-only bonus that, on
 *    any engine rejecting an unrecognized `advanced` member, throws at getUserMedia
 *    time — and acquireLocal's audio-only RETRY reuses base.audio, so the retry
 *    would throw too and the call would die with no fallback. Opt the bonus back in
 *    per-tab with localStorage MAYA_AUDIO_ADVANCED=1 (Chrome only) if you want it.
 * ✅ VIDEO CHANGES:
 *  - 🔒 facingMode is now {ideal:"user"} (was a bare string == EXACT). An exact
 *    facingMode throws OverconstrainedError on devices/virtual-cams that can't
 *    report "user", which made acquireLocal silently degrade the WHOLE call to
 *    audio-only (the "no video on some phones/webcams" symptom).
 */
const readPipeline = () => {
  try {
    const m = (
      globalThis.localStorage?.getItem("MAYA_AUDIO_PIPELINE") || "native"
    ).toLowerCase();
    return ["raw", "native", "notch", "notch+gate", "gate"].includes(m)
      ? m
      : "native";
  } catch {
    return "native";
  }
};

export const getMediaConstraints = (preset = getDefaultPreset()) => {
  const pipeline = readPipeline();
  const rawMic = pipeline === "raw"; // isolation test only: native processing OFF

  const video = {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    // 🔒 was a bare string "user" == EXACT -> OverconstrainedError on some devices
    //    -> silent audio-only degrade. {ideal} keeps the front-cam preference
    //    without ever failing the open.
    facingMode: { ideal: "user" },
  };

  if (rawMic) {
    return {
      video,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
      },
    };
  }

  const baseAudio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
  };

  // DEFAULT (native): browser NS + EC + AGC via the universally-honored booleans.
  // The custom gate is NOT engaged (buildProcessedAudioTrack returns null for
  // "native"), so this is pure WebRTC processing — the correct, cross-browser path.
  let audio = baseAudio;
  try {
    if (globalThis.localStorage?.getItem("MAYA_AUDIO_ADVANCED") === "1") {
      audio = {
        ...baseAudio,
        advanced: [
          {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            googEchoCancellation: true,
            googNoiseSuppression: true,
            googAutoGainControl: true,
            googHighpassFilter: true,
            googEchoCancellation2: true,
            googNoiseSuppression2: true,
            googAutoGainControl2: true,
            googLatestEchoCancellation: true,
          },
        ],
      };
    }
  } catch {}

  return { video, audio };
};

/**
 * Create RTCPeerConnection with settings favorable for quality.
 * (Confirmed correct: max-bundle + require are the modern safe defaults; omitting
 *  iceTransportPolicy keeps "all" = host+srflx+relay, which is what mobile needs.
 *  The sanitizeIceServers() here is a harmless second pass / defense-in-depth.)
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
 * RTX ("/rtx") and FEC codecs MUST remain immediately after their parent media
 * codec (linked by parameters.apt). We score+sort ONLY the media codecs and
 * re-attach each auxiliary codec right after its parent.
 *
 * 🔒 iOS<->CHROME BLACK-VIDEO FIX: the old scorer gave EVERY H.264 line the same
 *    score, so the browser's own capability order survived among them — and
 *    Chrome/Safari often list a HIGH-profile (profile-level-id=64..) H.264 first.
 *    Offering high-profile H.264 at the top makes the answerer pick it, and older /
 *    low-power iOS hardware decoders CANNOT decode high profile -> negotiated
 *    "H.264" but a black screen. We now rank H.264 BY PROFILE: constrained-
 *    baseline/baseline (the RFC 7742 mandatory-to-implement WebRTC profile, so it
 *    is guaranteed on iOS) leads, VP8 is the universal fallback right behind it,
 *    then main, then high, then VP9, then AV1. Result: iOS always lands on a
 *    profile it can decode, Chrome<->Chrome still gets H.264-baseline (battery),
 *    and high profile is never offered ahead of a decodable alternative.
 *
 * Modes:
 * - "compatible": prefer H264-baseline / VP8 (hardware/mobile stable, max interop)  <- default
 * - "efficient":  prefer AV1/VP9 (better compression, more CPU) but STILL keep
 *                 VP8 + H264-baseline in the list so an iOS/old peer that lacks
 *                 AV1/VP9 falls back to a codec it CAN decode (never black).
 */
const h264ProfileRank = (c) => {
  // profile-level-id lives in sdpFmtpLine ("...profile-level-id=42e01f;...") and/or
  // in parameters['profile-level-id'] depending on the engine.
  let plid = "";
  try {
    plid =
      (c?.parameters && c.parameters["profile-level-id"]) ||
      (String(c?.sdpFmtpLine || "").match(/profile-level-id=([0-9a-f]{6})/i) ||
        [])[1] ||
      "";
  } catch {}
  const hex = String(plid).toUpperCase();
  const pb = hex.slice(0, 2); // profile_idc byte
  if (pb === "42") return "baseline"; // 42xx = baseline / constrained-baseline (42e0..)
  if (pb === "4D") return "main";
  if (pb === "58") return "extended";
  if (
    pb === "64" ||
    pb === "6E" ||
    pb === "7A" ||
    pb === "F0" ||
    pb === "F4" ||
    pb === "F8" ||
    pb === "FC"
  )
    return "high";
  return "unknown";
};

const codecPriority = (c, mode) => {
  const m = String(c?.mimeType || "").toLowerCase();
  if (mode === "efficient") {
    if (m.includes("av1")) return 600;
    if (m.includes("vp9")) return 500;
    if (m.includes("vp8")) return 400;
    if (m.includes("h264")) {
      const r = h264ProfileRank(c);
      if (r === "baseline") return 300;
      if (r === "main") return 200;
      if (r === "high" || r === "extended") return 100;
      return 150; // unknown profile -> above high, below main
    }
    return 50;
  }
  // "compatible": max interop + mobile battery. H264-baseline first (spec-guaranteed
  // on iOS, hardware-accelerated), VP8 as the bulletproof fallback, then the rest.
  if (m.includes("h264")) {
    const r = h264ProfileRank(c);
    if (r === "baseline") return 600;
    if (r === "main") return 400;
    if (r === "high" || r === "extended") return 300;
    return 350; // unknown profile: below main, above high
  }
  if (m.includes("vp8")) return 500;
  if (m.includes("vp9")) return 200;
  if (m.includes("av1")) return 100;
  return 50;
};

export function preferVideoCodec(transceiver, mode = "compatible") {
  try {
    if (!transceiver || typeof transceiver.setCodecPreferences !== "function") {
      return;
    }

    // ✅ sender-caps fallback for engines where receiver.getCapabilities is empty/
    //    undefined (very old WebKit); if both are empty we leave default order,
    //    which on iOS is already H264/VP8-friendly.
    let all = RTCRtpReceiver.getCapabilities?.("video")?.codecs;
    if (!all || !all.length) {
      all = RTCRtpSender.getCapabilities?.("video")?.codecs;
    }
    all = all || [];
    if (!all.length) return;

    const mimeOf = (c) => String(c?.mimeType || "").toLowerCase();
    const isAux = (c) => {
      const m = mimeOf(c);
      return m.endsWith("/rtx") || m.endsWith("/fec") || m === "video/flexfec";
    };

    const media = all.filter((c) => !isAux(c));
    const aux = all.filter(isAux);
    if (!media.length) return;

    // 🔒 profile-aware sort (was a flat mime score that let high-profile H264 float
    //    to the top via stable-sort ties -> iOS black video).
    media.sort((a, b) => codecPriority(b, mode) - codecPriority(a, mode));

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
      width: undefined,
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

/* ═══════════════════════════════════════════════════════════════════════
   ✅ MICROPHONE DENOISER (self-contained, offline, attacker-safe)
   ---------------------------------------------------------------------
   Pipeline:  mic -> [high-pass BiquadFilter @85Hz] -> [AudioWorklet soft
   gate / downward expander] -> MediaStreamDestination -> cleaned track.

   The worklet is injected via a SAME-ORIGIN Blob URL (no CDN, no remote
   model, no extra committed file) so it cannot be tampered with over the
   network and works fully offline. It is a conservative adaptive gate:
   speech passes at unity gain; steady background (fan/AC/hiss/keyboard
   between words) is attenuated by a soft ~2:1 expander with hysteresis +
   a short hold so consonant onsets are never chopped and there is no
   "musical noise" / robotic cutoff (it never hard-mutes). Thresholds are
   PEAK-relative so browser AGC can't fool it.

   GUARANTEES:
   - Returns null (=> caller keeps the RAW track, browser NS only) if the
     API is missing, the AudioContext can't start (autoplay), or ANY step
     throws. A call can therefore NEVER become one-way-silent because of
     this feature.
   - Kill switch: localStorage MAYA_DISABLE_DENOISE === "1" disables it.
   ═══════════════════════════════════════════════════════════════════════ */

const DENOISER_WORKLET_SRC = `
   class MayaDenoiser extends AudioWorkletProcessor {
     constructor() {
       super();
       this.gain = 1; this.peak = 0.01; this.floor = 0.0005; this.hold = 0;
       this.gateOn = true;       // false => transparent passthrough (notch-only mode)
       this.analyze = false;     // Goertzel reporter on/off
       this.fs = sampleRate;
   
       // log-spaced Goertzel grid ~180..7500 Hz
       this.bins = [];
       const fMin = 180, fMax = 7500, octaves = Math.log2(fMax / fMin);
       const N = 28;
       for (let i = 0; i < N; i++) {
         const f = fMin * Math.pow(2, (i / (N - 1)) * octaves);
         const w = (2 * Math.PI * f) / this.fs;
         this.bins.push({ f, coeff: 2 * Math.cos(w), s1: 0, s2: 0 });
       }
       this.win = 1024; this.n = 0;
       this.lastHz = 0; this.stable = 0;
   
       this.port.onmessage = (e) => {
         const d = e && e.data; if (!d) return;
         if (d.type === 'gate') this.gateOn = !!d.value;
         if (d.type === 'analyze') this.analyze = !!d.value;
       };
     }
   
     _goertzelReset() { for (const b of this.bins) { b.s1 = 0; b.s2 = 0; } this.n = 0; }
   
     _report() {
       let best = -1, bi = -1;
       for (let i = 0; i < this.bins.length; i++) {
         const b = this.bins[i];
         const p = b.s1 * b.s1 + b.s2 * b.s2 - b.coeff * b.s1 * b.s2;
         if (p > best) { best = p; bi = i; }
       }
       if (bi < 0) return;
       // parabolic interpolation on power for sub-bin accuracy
       let hz = this.bins[bi].f;
       if (bi > 0 && bi < this.bins.length - 1) {
         const a = this._pow(bi - 1), c = this._pow(bi + 1), y = best;
         const denom = (a - 2 * y + c);
         if (denom !== 0) {
           const delta = 0.5 * (a - c) / denom;
           const bw = this.bins[bi].f - this.bins[bi - 1].f; // approx spacing in Hz
           hz = this.bins[bi].f + delta * bw;
         }
       }
       const mag = Math.sqrt(Math.max(0, best)) / this.win;
       this.port.postMessage({ type: 'dominant', hz: Math.round(hz), mag });
     }
     _pow(i) { const b = this.bins[i]; return b.s1 * b.s1 + b.s2 * b.s2 - b.coeff * b.s1 * b.s2; }
   
     process(inputs, outputs) {
       const inp = inputs[0], outp = outputs[0];
       if (!inp || !inp.length || !outp || !outp.length) return true;
       const n = outp[0].length, ch = inp.length;
   
       let sum = 0, cnt = 0;
       for (let c = 0; c < ch; c++) { const d = inp[c]; for (let i = 0; i < n; i++) { const v = d[i]; sum += v * v; cnt++; } }
       const rms = cnt ? Math.sqrt(sum / cnt) : 0;
   
       // analysis (incremental Goertzel on mono mix)
       if (this.analyze) {
         const mix = ch > 1 ? null : inp[0];
         for (let i = 0; i < n; i++) {
           const x = ch > 1 ? (inp.reduce((s, d) => s + d[i], 0) / ch) : mix[i];
           for (const b of this.bins) { const s = x + b.coeff * b.s1 - b.s2; b.s2 = b.s1; b.s1 = s; }
           if (++this.n >= this.win) { this._report(); this._goertzelReset(); }
         }
       }
   
       const outCh = outp[0], inCh0 = inp[0];
   
       if (!this.gateOn) { for (let i = 0; i < n; i++) outCh[i] = inCh0[i]; return true; } // transparent
   
       this.peak = Math.max(rms, this.peak * 0.9995);
       if (rms < this.peak * 0.2) { this.floor = this.floor * 0.98 + rms * 0.02; if (this.floor < 0.0002) this.floor = 0.0002; }
       const open = Math.max(this.floor * 3.0, this.peak * 0.30);
       const close = open * 0.65;
       let target;
       if (rms >= open) { target = 1; this.hold = 14; }
       else if (this.hold > 0) { target = 1; this.hold--; }
       else if (rms <= close) { const r = close > 0 ? rms / close : 0; target = Math.max(0.025, Math.pow(r, 2.2)); }
       else target = this.gain;
       for (let i = 0; i < n; i++) { const a = target > this.gain ? 0.65 : 0.045; this.gain += (target - this.gain) * a; outCh[i] = inCh0[i] * this.gain; }
       return true;
     }
   }
   registerProcessor('maya-denoiser', MayaDenoiser);
   `;

/**
 * Build a noise-suppressed replacement for a microphone audio track.
 * @param {MediaStreamTrack} micTrack the raw getUserMedia audio track
 * @returns {Promise<{track:MediaStreamTrack, dispose:()=>void, node:AudioWorkletNode}|null>}
 *          null => not supported / disabled / failed; KEEP the raw track.
 */
export async function buildProcessedAudioTrack(micTrack) {
  try {
    if (!micTrack || micTrack.kind !== "audio") return null;
    if (typeof window === "undefined") return null;

    let pipeline = "native";
    try {
      pipeline = (
        globalThis.localStorage?.getItem("MAYA_AUDIO_PIPELINE") || "native"
      ).toLowerCase();
    } catch {}
    if (pipeline === "raw" || pipeline === "native") return null; // no worklet; native/none only

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !AC.prototype || !AC.prototype.audioWorklet) return null;
    try {
      if (globalThis.localStorage?.getItem("MAYA_DISABLE_DENOISE") === "1")
        return null;
    } catch {}

    let ctx = null;
    try {
      ctx = new AC({ sampleRate: 48000 });
    } catch {
      ctx = null;
    }
    if (!ctx) {
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (!ctx) return null;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {}
      if (ctx.state !== "running") {
        try {
          ctx.close();
        } catch {}
        return null;
      }
    }

    let analyze = false,
      autoNotch = false,
      notchHz = 0,
      notchQ = 18;
    try {
      analyze =
        globalThis.localStorage?.getItem("MAYA_ANALYZE") === "1" ||
        globalThis.localStorage?.getItem("MAYA_NOTCH_AUTO") === "1" ||
        isWebRtcDebugEnabled();
      autoNotch = globalThis.localStorage?.getItem("MAYA_NOTCH_AUTO") === "1";
      const nh = Number(globalThis.localStorage?.getItem("MAYA_NOTCH_HZ"));
      if (Number.isFinite(nh) && nh >= 120 && nh <= 12000) notchHz = nh;
      const nq = Number(globalThis.localStorage?.getItem("MAYA_NOTCH_Q"));
      if (Number.isFinite(nq) && nq > 0.5 && nq <= 50) notchQ = nq;
    } catch {}

    const src = ctx.createMediaStreamSource(new MediaStream([micTrack]));
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 85;
    hp.Q.value = 0.7;
    src.connect(hp);

    let notch = null;
    const wantsNotch = pipeline === "notch" || pipeline === "notch+gate";
    if (wantsNotch && (notchHz > 0 || autoNotch)) {
      notch = ctx.createBiquadFilter();
      notch.type = "notch";
      notch.frequency.value = notchHz || 1000;
      notch.Q.value = notchQ;
      hp.connect(notch);
    } else {
      // no notch node: chain hp straight into the worklet below
    }

    const blob = new Blob([DENOISER_WORKLET_SRC], {
      type: "application/javascript",
    });
    const url = URL.createObjectURL(blob);
    let node = null;
    try {
      await ctx.audioWorklet.addModule(url);
      node = new AudioWorkletNode(ctx, "maya-denoiser", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
    } finally {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    if (!node) return null;

    node.port.postMessage({
      type: "gate",
      value: pipeline === "gate" || pipeline === "notch+gate",
    });
    node.port.postMessage({ type: "analyze", value: !!analyze });

    // auto-notch: track the dominant tone only while non-speech, smoothed
    if (notch && autoNotch) {
      let ema = 0;
      node.port.onmessage = (e) => {
        const d = e && e.data;
        if (!d || d.type !== "dominant") return;
        if (isWebRtcDebugEnabled() && d.mag > 0.0008)
          console.log(
            "🔎 dominant ~" + d.hz + " Hz (mag " + d.mag.toFixed(5) + ")"
          );
        if (d.mag < 0.0008) return; // ignore noise-floor wobble
        if (d.hz < 150 || d.hz > 9000) return;
        ema = ema ? ema * 0.7 + d.hz * 0.3 : d.hz; // smooth
        try {
          notch.frequency.setTargetAtTime(ema, ctx.currentTime, 0.25);
        } catch {}
      };
    } else if (isWebRtcDebugEnabled()) {
      node.port.onmessage = (e) => {
        const d = e && e.data;
        if (d && d.type === "dominant" && d.mag > 0.0008)
          console.log("🔎 dominant ~" + d.hz + " Hz");
      };
    }

    const dest = ctx.createMediaStreamDestination();
    if (notch) notch.connect(node);
    else hp.connect(node);
    node.connect(dest);

    const out = dest.stream.getAudioTracks()[0];
    if (!out) throw new Error("no processed audio track produced");
    out.enabled = micTrack.enabled;

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      try {
        out.stop();
      } catch {}
      try {
        src.disconnect();
      } catch {}
      try {
        hp.disconnect();
      } catch {}
      try {
        notch && notch.disconnect();
      } catch {}
      try {
        node.disconnect();
      } catch {}
      try {
        ctx.close();
      } catch {}
    };
    try {
      micTrack.addEventListener("ended", dispose, { once: true });
    } catch {}

    if (isWebRtcDebugEnabled())
      console.log(
        "🎚 audio pipeline: " +
          pipeline +
          (notch
            ? " (notch @" +
              Math.round(notch.frequency.value) +
              "Hz" +
              (autoNotch ? " auto)" : ")")
            : "") +
          (analyze ? " [analyzer]" : "")
      );
    return { track: out, dispose, node };
  } catch (err) {
    if (isWebRtcDebugEnabled())
      console.warn("buildProcessedAudioTrack skipped:", err?.message || err);
    return null; // never throw into the call flow
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ⚠️ DEPRECATED pre-flight (kept only so any stale importer still builds).
   useCall.js does NOT use this — it uses classifyMic(), which is the same
   real-getUserMedia probe. The old body trusted navigator.permissions.query as
   a FAST PATH and returned granted/denied WITHOUT probing, which is exactly the
   lying-query bug that produced false "Microphone is blocked" panels. The body
   below is now probe-first (real getUserMedia confirms success; the query only
   LABELS a failure as site-denied vs os-blocked). Signature/arity/return
   container are unchanged so call sites don't move.
   ═══════════════════════════════════════════════════════════════════════ */
const MIC_PROBE = {
  audio: { channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 } },
  video: false,
};

async function resolveKind(name, probeConstraints) {
  if (!navigator.mediaDevices?.getUserMedia) return "error"; // insecure ctx / unsupported
  let siteState = null;
  try {
    siteState = (await navigator.permissions?.query?.({ name }))?.state || null;
  } catch {}
  try {
    const s = await navigator.mediaDevices.getUserMedia(probeConstraints);
    s.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {}
    }); // stop immediately: no hot device
    return "granted"; // a REAL success beats any query claim
  } catch (e) {
    const n = e?.name;
    if (
      n === "NotAllowedError" ||
      n === "SecurityError" ||
      n === "PermissionDeniedError"
    ) {
      if (siteState === "denied") return "denied"; // site block: lock icon helps
      if (siteState === "granted") return "os-blocked"; // site ok but OS/hw blocks
      return "denied"; // unknown query -> safe default guidance
    }
    if (
      n === "NotFoundError" ||
      n === "DevicesNotFoundError" ||
      n === "OverconstrainedError" ||
      n === "ConstraintNotSatisfiedError"
    )
      return "no-device";
    if (n === "NotReadableError" || n === "AbortError") return "occupied";
    return "error";
  }
}

// Signature/arity unchanged (mediaType kept so call sites don't move); the body
// now resolves the microphone with a REAL probe, so the camera is opened exactly
// once elsewhere and this never lies about the mic.
export async function requestMediaPermission(_mediaType) {
  const mic = await resolveKind("microphone", MIC_PROBE);
  return { mic, cam: null }; // camera status is decided later, by acquireLocal (single open)
}
