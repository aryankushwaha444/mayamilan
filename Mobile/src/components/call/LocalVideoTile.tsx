// src/components/call/LocalVideoTile.tsx
// Presentational self-preview (the mock's selfPip). Renders the LOCAL camera stream mirrored;
// when the user turns their camera off (or no stream yet) it shows a dark tile + label — NO
// image, so a "camera off" state never implies a remote URL. streamURL is a local media handle
// (stream.toURL()), not a network fetch; the encryption boundary is the signaling layer (useCall).
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { RTCView, type MediaStream } from "react-native-webrtc"; // probe-INSTALLED => static import OK
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

interface Props {
  stream: MediaStream | null;
  muted: boolean;
  videoOff: boolean;
}

export default function LocalVideoTile({ stream, muted, videoOff }: Props) {
  const url = !videoOff ? stream?.toURL() : undefined; // no non-null assertion; guarded
  return (
    <View style={st.pip}>
      {url ? (
        <RTCView streamURL={url} mirror objectFit="cover" style={st.video} />
      ) : (
        <View style={st.offWrap}>
          <Ionicons
            name={videoOff ? "videocam-off" : "person"}
            size={22}
            color={colors.subtext}
          />
        </View>
      )}
      <View style={st.badgeRow}>
        <View style={st.badge}>
          <Text style={st.badgeText}>You</Text>
        </View>
        {muted && (
          <View
            style={[st.badge, st.badgeMuted]}
            accessibilityLabel="You are muted"
          >
            <Ionicons name="mic-off" size={10} color="#fff" />
          </View>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  pip: {
    position: "absolute",
    top: 110,
    right: 20,
    width: 100,
    height: 140,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#ffffff",
    zIndex: 20,
    backgroundColor: "#1e293b",
  },
  video: { width: "100%", height: "100%" },
  offWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
  },
  badgeRow: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeMuted: { backgroundColor: "#ef4444", paddingHorizontal: 4 },
  badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
});
