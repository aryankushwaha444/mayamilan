import { View, ActivityIndicator, StyleSheet } from "react-native";
import { brand, colors } from "../../theme";

export default function Loader({
  fullScreen,
  size = "large",
}: {
  fullScreen?: boolean;
  size?: "small" | "large";
}) {
  const c = <ActivityIndicator size={size} color={brand.from} />;
  if (!fullScreen) return c;
  return <View style={styles.full}>{c}</View>;
}
const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBg,
  },
});
