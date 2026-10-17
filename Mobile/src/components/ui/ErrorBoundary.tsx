import { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, brand, radius } from "../../theme";

export default class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* send to monitoring later */
  }
  reset = () => this.setState({ hasError: false });
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>
            Please try again. If it persists, restart the app.
          </Text>
          <Pressable
            style={styles.btn}
            onPress={this.reset}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.pageBg,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.heading },
  sub: { fontSize: 14, color: colors.subtext, textAlign: "center" },
  btn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: brand.from,
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
