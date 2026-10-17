import { useState } from "react";
import {
  Image,
  View,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
  type ImageStyle, // ← added (for the cast below)
  type ImageResizeMode,
} from "react-native";
import { colors } from "../../theme";

export default function SmartImage({
  source,
  style,
  resizeMode = "cover",
  fallbackColor = colors.inputFill,
}: {
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>; // broad on purpose: matches StyleSheet.create output & the <View> fallback
  resizeMode?: ImageResizeMode;
  fallbackColor?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Fallback branch: native View, so ViewStyle is correct here (no cast needed).
  if (failed || !source)
    return (
      <View style={[styles.ph, { backgroundColor: fallbackColor }, style]} />
    );

  // Image branch: cast at the boundary. ViewStyle→ImageStyle overlap is enough
  // for TS to allow the assertion; the only excluded value (overflow:"scroll")
  // is invalid on images regardless, so this is safe.
  return (
    <Image
      source={source}
      style={style as StyleProp<ImageStyle>} // ← the fix
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({ ph: { overflow: "hidden" } });
