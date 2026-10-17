// src/components/call/InCallOverlay.tsx
// Presentational call chrome (the mock's topHeader + bottomControls), extracted verbatim in
// look/feel. Handler-AGNOSTIC: onEnd/onMute/onToggleVideo/onSpeaker are passed in, so the SAME
// overlay drives the working mock today (onEnd = goBack) AND the real teardown next turn
// (onEnd = socket call:end + incall-manager.stop + expo-audio reset) with no edit here.
// avatarSource is the screen's pre-gated safeAvatarSource output; no uri built in this file.
import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, colors } from "../../theme";

export type CallStatus =
  | "connecting"
  | "ringing"
  | "connected"
  | "ended"
  | "failed"
  | "no-answer"
  | "declined"
  | "busy";

interface Props {
  status: CallStatus;
  seconds: number;
  isMuted: boolean;
  isSpeaker: boolean;
  videoOff: boolean;
  isVideo: boolean;
  name: string;
  avatarSource: { uri: string } | number;
  onMute: () => void;
  onToggleVideo: () => void;
  onSpeaker: () => void;
  onEnd: () => void;
}

const fmt = (t: number) => {
  const m = Math.floor(t / 60),
    s = t % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
};
const statusText = (st: CallStatus, isVideo: boolean, seconds: number) => {
  if (st === "connected")
    return `${isVideo ? "HD Video Call" : "Voice Call"} • ${fmt(seconds)}`;
  if (st === "ringing" || st === "connecting") return "Connecting…";
  if (st === "busy") return "Line busy";
  if (st === "no-answer") return "No answer";
  if (st === "declined") return "Declined";
  if (st === "failed") return "Call failed";
  return "Securing call…";
};

export default function InCallOverlay(p: Props) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={[st.top, { paddingTop: insets.top + 20 }]}>
        <View style={st.avatarBorder}>
          <Image source={p.avatarSource as any} style={st.avatar} />
        </View>
        <Text style={st.name} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={st.state} numberOfLines={2}>
          {statusText(p.status, p.isVideo, p.seconds)}
        </Text>
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 30 }]}>
        <TouchableOpacity
          style={[st.btn, p.isMuted && st.btnOn]}
          onPress={p.onMute}
          accessibilityLabel={p.isMuted ? "Unmute" : "Mute"}
        >
          <Ionicons
            name={p.isMuted ? "mic-off" : "mic"}
            size={24}
            color={p.isMuted ? "#ef4444" : "#ffffff"}
          />
        </TouchableOpacity>
        {p.isVideo && (
          <TouchableOpacity
            style={[st.btn, p.videoOff && st.btnOn]}
            onPress={p.onToggleVideo}
            accessibilityLabel={
              p.videoOff ? "Turn camera on" : "Turn camera off"
            }
          >
            <Ionicons
              name={p.videoOff ? "videocam-off" : "videocam"}
              size={24}
              color={p.videoOff ? "#ef4444" : "#ffffff"}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[st.btn, p.isSpeaker && st.btnOn]}
          onPress={p.onSpeaker}
          accessibilityLabel={p.isSpeaker ? "Speaker off" : "Speaker on"}
        >
          <Ionicons
            name={p.isSpeaker ? "volume-high" : "volume-mute"}
            size={24}
            color={p.isSpeaker ? brand.from : "#ffffff"}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.btn, st.end]}
          onPress={p.onEnd}
          accessibilityLabel="End Call"
        >
          <Ionicons
            name="call"
            size={28}
            color="#ffffff"
            style={{ transform: [{ rotate: "135deg" }] }}
          />
        </TouchableOpacity>
      </View>
    </>
  );
}

const st = StyleSheet.create({
  top: { alignItems: "center", zIndex: 10, paddingHorizontal: 20 },
  avatarBorder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.4)",
    padding: 3,
    marginBottom: 14,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 42,
    backgroundColor: "#1e293b",
  },
  name: { fontSize: 26, fontWeight: "800", color: "#ffffff", maxWidth: "90%" },
  state: {
    fontSize: 14,
    color: "#cbd5e1",
    marginTop: 6,
    fontWeight: "500",
    textAlign: "center",
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    zIndex: 30,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOn: { backgroundColor: "rgba(255,255,255,0.9)" },
  end: { backgroundColor: "#ef4444", width: 64, height: 64, borderRadius: 32 },
});
