// src/components/chat/DateSeparator.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme";

export default function DateSeparator({ label }: { label: string }) {
  return (
    <View style={s.wrap}>
      <Text style={s.txt}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { alignItems: "center", marginVertical: 12 },
  txt: {
    fontSize: 12,
    color: colors.subtext,
    backgroundColor: colors.inputFill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: "600",
  },
});
