// src/components/chat/TypingIndicator.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, brand } from "../../theme";

export default function TypingIndicator({ name }: { name?: string }) {
  return (
    <View style={s.row}>
      {!!name && <Text style={s.name}>{name} </Text>}
      <Text style={s.txt}>is typing</Text>
      <View style={s.dots}>
        <View style={s.dot} />
        <View style={s.dot} />
        <View style={s.dot} />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 2,
  },
  name: { fontSize: 13, fontWeight: "700", color: colors.heading },
  txt: { fontSize: 13, color: colors.subtext },
  dots: { flexDirection: "row", gap: 3, marginLeft: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: brand.from },
});
