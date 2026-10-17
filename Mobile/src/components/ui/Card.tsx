import { View, StyleSheet, type ViewStyle } from "react-native";
import { colors, radius, space, cardShadow } from "../../theme";

export default function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: space.card,
    ...cardShadow,
  },
});
