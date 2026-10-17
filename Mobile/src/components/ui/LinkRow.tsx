import { View, Text, Pressable, StyleSheet } from "react-native";
import { fonts } from "../../theme";

export default function LinkRow({
  text,
  link,
  actionText,
  onPress,
}: {
  text: string;
  link?: string;
  actionText?: string;
  onPress: () => void;
}) {
  const display = actionText || link || "";
  return (
    <View style={styles.row}>
      <Text style={fonts.muted}>{text} </Text>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel={display}
      >
        <Text style={fonts.link}>{display}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
});
