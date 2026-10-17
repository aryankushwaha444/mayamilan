// src/components/chat/CallRow.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";
import { formatTime } from "../../utils/date";
import type { ChatMessage } from "../../types/chat";

export default function CallRow({ item }: { item: ChatMessage }) {
  const video = item.callType === "video";
  return (
    <View style={s.row}>
      <Ionicons
        name={video ? "videocam" : "call"}
        size={16}
        color={colors.subtext}
      />
      <Text style={s.txt}>
        {video ? "Video" : "Voice"} call • {formatTime(item.createdAt)}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginVertical: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    alignSelf: "center",
  },
  txt: { fontSize: 12, color: colors.subtext, fontWeight: "600" },
});
