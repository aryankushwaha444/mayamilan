// src/components/chat/MessageStatusTick.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";
import type { ChatMessage } from "../../types/chat";

export default function MessageStatusTick({
  message,
  isMe,
}: {
  message: ChatMessage;
  isMe: boolean;
}) {
  if (!isMe) return null;
  if (message.isRead)
    return (
      <View style={s.wrap}>
        <View style={s.readCircle}>
          <Ionicons name="checkmark-done" size={12} color="#3b82f6" />
        </View>
      </View>
    );
  if (message.isDelivered)
    return (
      <View style={s.wrap}>
        <Ionicons name="checkmark-done" size={14} color={colors.white} />
      </View>
    );
  return (
    <View style={s.wrap}>
      <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", marginLeft: 4 },
  readCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.1)",
  },
});
