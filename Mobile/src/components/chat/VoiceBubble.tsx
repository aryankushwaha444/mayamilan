// src/components/chat/VoiceBubble.tsx
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, brand } from "../../theme";
import { isSafeMediaUrl } from "../../utils/media";
import { formatDuration } from "../../utils/date";

interface Props {
  uri: string;
  duration?: number;
  isMe: boolean;
}

export default function VoiceBubble({ uri, duration, isMe }: Props) {
  // Gate at the boundary: an unsafe/empty URL must never reach the player.
  const safe = isSafeMediaUrl(uri);
  const player = useAudioPlayer(safe ? uri : null);
  const state = useAudioPlayerStatus(player);
  const total = state.duration || duration || 0;
  const current = state.currentTime || 0;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  const trackW = useRef(0);
  const seek = (x: number) => {
    if (!safe || total <= 0 || trackW.current <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / trackW.current));
    try {
      player.seekTo(ratio * total);
    } catch {}
  };

  if (!safe) {
    return (
      <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
        <Ionicons
          name="mic-off"
          size={18}
          color={isMe ? "rgba(255,255,255,.8)" : colors.subtext}
        />
        <Text style={[styles.fallback, isMe ? styles.txtMe : styles.txtOther]}>
          Voice unavailable
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
      <TouchableOpacity
        style={[styles.play, isMe ? styles.playMe : styles.playOther]}
        onPress={() => (state.playing ? player.pause() : player.play())}
        accessibilityLabel={
          state.playing ? "Pause voice message" : "Play voice message"
        }
      >
        <Ionicons
          name={state.playing ? "pause" : "play"}
          size={16}
          color={isMe ? "#fff" : brand.from}
        />
      </TouchableOpacity>

      <View style={styles.mid}>
        <View
          style={[styles.track, !isMe && styles.trackOther]}
          onLayout={(e) => {
            trackW.current = e.nativeEvent.layout.width;
          }}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => seek(e.nativeEvent.locationX)}
          onResponderMove={(e) => seek(e.nativeEvent.locationX)}
        >
          <View
            style={[
              styles.fill,
              !isMe && styles.fillOther,
              { width: `${pct}%` },
            ]}
          />
        </View>
        <Text style={[styles.time, isMe ? styles.txtMe : styles.txtOther]}>
          {formatDuration(current)} / {formatDuration(total)}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.overflow}
        onPress={() => Linking.openURL(uri).catch(() => {})}
        accessibilityLabel="Open / download voice message"
      >
        <Ionicons
          name="ellipsis-vertical"
          size={16}
          color={isMe ? "rgba(255,255,255,.85)" : colors.subtext}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 180,
    paddingVertical: 2,
  },
  rowMe: {},
  rowOther: {},
  play: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  playMe: { backgroundColor: "rgba(255,255,255,.25)" },
  playOther: { backgroundColor: "rgba(225,29,116,.12)" },
  mid: { flex: 1, gap: 3 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.3)",
    overflow: "hidden",
  },
  trackOther: { backgroundColor: "rgba(0,0,0,.1)" },
  fill: { height: 4, backgroundColor: "#fff" },
  fillOther: { backgroundColor: brand.from },
  time: { fontSize: 10 },
  txtMe: { color: "rgba(255,255,255,.85)" },
  txtOther: { color: colors.subtext },
  overflow: { paddingHorizontal: 2 },
  fallback: { fontSize: 13 },
});
