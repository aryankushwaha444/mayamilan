import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { brand, radius, fonts } from "../../theme";

export function BrandIcon({ size = 68 }: { size?: number }) {
  return (
    <LinearGradient
      colors={[brand.from, brand.to]}
      start={brand.start}
      end={brand.end}
      style={[
        styles.brandIcon,
        { width: size, height: size, borderRadius: radius.icon },
      ]}
      accessibilityLabel="Maya Milan"
    >
      <Ionicons name="heart" size={size * 0.46} color="#fff" />
    </LinearGradient>
  );
}

export default function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.header}>
      <BrandIcon />
      <Text style={[fonts.h1, styles.title]}>{title}</Text>
      <Text style={[fonts.sub, styles.sub]}>{subtitle}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  brandIcon: { alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 24, gap: 6 },
  title: { textAlign: "center", marginTop: 6 },
  sub: { textAlign: "center" },
});
