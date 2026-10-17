// src/components/ui/GradientButton.tsx
import { Pressable, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { brand, radius, btnShadow, fonts } from "../../theme";

export default function GradientButton({
  title,
  onPress,
  loading,
  disabled,
  iconRight,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** false = hide the arrow (e.g. a "Done" button). Omitted/true = shown (default). */
  iconRight?: boolean;
}) {
  // undefined or true → show. Keeps Login/Register pixel-identical (they never pass it).
  const showArrow = iconRight !== false;

  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        pressed && !disabled && { opacity: 0.92 },
        disabled && { opacity: 0.6 },
      ]}
    >
      <LinearGradient
        colors={[brand.from, brand.to]}
        start={brand.start}
        end={brand.end}
        style={[styles.gradBtn, btnShadow]}
      >
        {loading ? (
          <Ionicons
            name="hourglass-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
        ) : (
          showArrow && (
            <Ionicons
              name="arrow-forward"
              size={18}
              color="#fff"
              style={{ marginRight: 8 }}
            />
          )
        )}
        <Text style={fonts.btn}>{loading ? "Please wait…" : title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gradBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: radius.button,
    marginTop: 4,
  },
});
