import { TextStyle, ViewStyle } from "react-native";

export const colors = {
  pageBg: "#f1f5f9",
  card: "#ffffff",
  heading: "#0f172a",
  subtext: "#64748b",
  label: "#1e293b",
  inputFill: "#f8fafc",
  inputBorder: "#e2e8f0",
  placeholder: "#94a3b8",
  iconTint: "#7c3aed",
  link: "#2563eb",
  stepperInactiveFill: "#e2e8f0",
  stepperInactiveText: "#94a3b8",
  stepperActiveText: "#7c3aed",
  danger: "#dc2626",
  white: "#ffffff",
};

// ✅ start/end are MUTABLE [number, number] tuples (NOT `as const`), because
//    expo-linear-gradient's LinearGradientPoint is `[number, number]`; a readonly
//    tuple from `as const` is not assignable and was the source of the 4 overloads.
export const brand = {
  from: "#ec4899",
  to: "#8b5cf6",
  start: [0, 0] as [number, number],
  end: [1, 1] as [number, number],
};

export const radius = { card: 24, field: 14, button: 14, icon: 18, chip: 12 };
export const space = { card: 28, gap: 16, fieldGap: 18 };

export const cardShadow: ViewStyle = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.12,
  shadowRadius: 25,
  shadowOffset: { width: 0, height: 10 },
  elevation: 8,
};
export const btnShadow: ViewStyle = {
  shadowColor: brand.to,
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 5,
};

export const fonts = {
  h1: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.heading,
    letterSpacing: -0.5,
  } as TextStyle,
  sub: { fontSize: 15.5, color: colors.subtext } as TextStyle,
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.label,
    marginBottom: 7,
  } as TextStyle,
  input: { fontSize: 16, color: colors.heading } as TextStyle,
  btn: { fontSize: 16.5, fontWeight: "700", color: colors.white } as TextStyle,
  link: { fontSize: 15, color: colors.link, fontWeight: "600" } as TextStyle,
  muted: { fontSize: 15, color: colors.subtext } as TextStyle,
};
