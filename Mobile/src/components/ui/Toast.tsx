import { View, Text, StyleSheet } from "react-native";
import { colors, radius } from "../../theme";

type Kind = "success" | "error" | "info";
const BG: Record<Kind, string> = {
  success: "#059669",
  error: colors.danger,
  info: colors.heading,
};

export default function Toast({
  visible,
  message,
  type = "info",
}: {
  visible: boolean;
  message: string;
  type?: Kind;
}) {
  if (!visible || !message) return null;
  return (
    <View
      style={styles.wrap}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.pill, { backgroundColor: BG[type] }]}>
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
    alignItems: "center",
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.button,
    maxWidth: "100%",
  },
  text: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center" },
});
