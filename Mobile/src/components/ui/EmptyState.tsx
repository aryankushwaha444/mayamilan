import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

export default function EmptyState({
  icon = "file-tray-outline",
  title,
  subtitle,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={56} color={colors.subtext} />
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    color: colors.subtext,
    textAlign: "center",
    lineHeight: 20,
  },
});
