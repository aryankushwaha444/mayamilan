import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, brand, space } from "../theme";

export default function ScreenPlaceholder({
  icon = "hourglass-outline",
  title,
  hint = "This screen is scaffolded and coming soon.",
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Ionicons name={icon} size={30} color="#fff" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.card, backgroundColor: colors.pageBg, gap: 10 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: brand.from },
  title: { fontSize: 18, fontWeight: "800", color: colors.heading, textAlign: "center" },
  hint: { fontSize: 14, color: colors.subtext, textAlign: "center", lineHeight: 20, maxWidth: 280 },
});
