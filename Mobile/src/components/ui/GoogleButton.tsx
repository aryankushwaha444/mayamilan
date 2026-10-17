import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../../theme";

export default function GoogleButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
    >
      <Ionicons name="logo-google" size={20} color="#ea4335" />
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  text: { fontSize: 15.5, fontWeight: "600", color: colors.heading },
});
