// src/screens/call/CallScreen.tsx
//
// Real call UI. Live state comes from CallContext/useCall, not route.params.
// route.params is only a fallback for initial paint and is still sanitized.

import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isSafeMediaUrl } from "../../utils/media";
import { useCallContext } from "../../context/CallContext";

import LocalVideoTile from "../../components/call/LocalVideoTile";
import RemoteVideoTile from "../../components/call/RemoteVideoTile";
import InCallOverlay from "../../components/call/InCallOverlay";

const DEFAULT_AVATAR = require("../../../assets/default-avatar.png");

const MAX_NAME = 60;

function safeName(raw: unknown): string {
  if (typeof raw !== "string") return "Unknown";

  const t = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return t.length ? t : "Unknown";
}

function safeAvatarSource(
  raw: unknown
): { uri: string } | typeof DEFAULT_AVATAR {
  const url =
    typeof raw === "string"
      ? raw
      : raw && typeof (raw as any).url === "string"
      ? (raw as any).url
      : null;

  return url && isSafeMediaUrl(url) ? { uri: url } : DEFAULT_AVATAR;
}

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const {
    phase,
    status,
    peer,
    mediaType,
    localStream,
    remoteStream,
    isMuted,
    isSpeaker,
    videoOff,
    seconds,
    error,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  } = useCallContext();

  const rawPartner = (route.params?.partner ?? {}) as any;

  const displayName = peer?.name || safeName(rawPartner.name);

  const displayPhoto =
    peer?.photo ||
    (Array.isArray(rawPartner.photos)
      ? rawPartner.photos[0]?.url || rawPartner.photos[0]
      : null);

  const avatarSource = safeAvatarSource(displayPhoto);

  const isVideo = mediaType === "video" || !!route.params?.isVideo;

  const active = phase !== "idle";
  const incoming = phase === "incoming";

  const overlayStatus = !active
    ? status === "idle"
      ? "ended"
      : status
    : status === "incoming"
    ? "ringing"
    : status === "outgoing"
    ? "connecting"
    : status === "canceled"
    ? "ended"
    : status;

  const onEnd = active
    ? () => void endCall("hangup")
    : () => navigation.goBack();

  return (
    <View style={st.container}>
      <RemoteVideoTile
        stream={incoming ? null : remoteStream}
        isVideo={incoming ? false : isVideo}
        name={displayName}
        avatarSource={avatarSource}
      />

      <View style={st.overlay} />

      {isVideo && active && (
        <LocalVideoTile
          stream={localStream}
          muted={isMuted}
          videoOff={videoOff}
        />
      )}

      {incoming ? (
        <View style={[st.incomingWrap, { paddingBottom: insets.bottom + 30 }]}>
          <View style={st.incomingHeader}>
            <View style={st.avatarBorder}>
              <Image source={avatarSource as any} style={st.incomingAvatar} />
            </View>

            <Text style={st.name} numberOfLines={1}>
              {displayName}
            </Text>

            <Text style={st.state} numberOfLines={2}>
              Incoming {isVideo ? "video" : "voice"} call…
            </Text>

            {!!error && (
              <Text style={st.error} numberOfLines={2}>
                {error}
              </Text>
            )}
          </View>

          <View style={st.incomingControls}>
            <TouchableOpacity
              style={[st.roundBtn, st.rejectBtn]}
              onPress={rejectCall}
              accessibilityLabel="Reject call"
            >
              <Ionicons
                name="call"
                size={28}
                color="#fff"
                style={{ transform: [{ rotate: "135deg" }] }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.roundBtn, st.acceptBtn]}
              onPress={() => void acceptCall()}
              accessibilityLabel="Accept call"
            >
              <Ionicons name="call" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <InCallOverlay
          status={overlayStatus as any}
          seconds={seconds}
          isMuted={isMuted}
          isSpeaker={isSpeaker}
          videoOff={videoOff}
          isVideo={isVideo}
          name={displayName}
          avatarSource={avatarSource}
          onMute={toggleMute}
          onToggleVideo={toggleVideo}
          onSpeaker={toggleSpeaker}
          onEnd={onEnd}
        />
      )}

      {!!error && active && !incoming && (
        <View style={st.errorBar}>
          <Text style={st.errorText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  incomingAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 42,
    backgroundColor: "#1e293b",
  },
  incomingWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 40,
  },
  incomingHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  avatarBorder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.4)",
    padding: 3,
    marginBottom: 14,
    overflow: "hidden",
    backgroundColor: "#1e293b",
  },
  name: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    maxWidth: "90%",
  },
  state: {
    fontSize: 14,
    color: "#cbd5e1",
    marginTop: 6,
    fontWeight: "500",
    textAlign: "center",
  },
  incomingControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 44,
  },
  roundBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtn: { backgroundColor: "#ef4444" },
  acceptBtn: { backgroundColor: "#22c55e" },
  errorBar: {
    position: "absolute",
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(239,68,68,0.92)",
    borderRadius: 14,
    padding: 12,
    zIndex: 50,
  },
  errorText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  error: {
    color: "#fca5a5",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
    maxWidth: "90%",
  },
});
