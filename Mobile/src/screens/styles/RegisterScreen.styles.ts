// src/screens/styles/RegisterScreen.styles.ts
import { StyleSheet } from "react-native";
import { colors } from "../../theme";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  scroll: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.heading,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15.5,
    color: colors.subtext,
    textAlign: "center",
  },
  errBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errTxt: {
    color: colors.danger,
    fontSize: 13,
  },
  strengthContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  strengthBar: {
    height: 6,
    backgroundColor: colors.inputBorder,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  strengthFill: {
    height: "100%",
    borderRadius: 3,
  },
  strengthText: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.inputFill,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  chip: {
    flex: 1,
    minWidth: "45%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputFill,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: colors.iconTint,
    borderColor: colors.iconTint,
  },
  chipText: {
    fontSize: 15,
    color: colors.subtext,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: "700",
  },
  goalRow: {
    gap: 12,
  },
  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputFill,
    gap: 12,
  },
  goalCardActive: {
    borderColor: colors.iconTint,
    backgroundColor: "#f3e8ff",
  },
  goalIcon: {
    fontSize: 24,
  },
  goalLabel: {
    fontSize: 15,
    color: colors.subtext,
    fontWeight: "600",
  },
  goalLabelActive: {
    color: colors.iconTint,
    fontWeight: "700",
  },
  otpInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.inputFill,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 8,
    color: colors.heading,
  },
  resendBtn: {
    marginTop: 8,
    alignItems: "center",
  },
  resendText: {
    color: colors.link,
    fontSize: 15,
    fontWeight: "600",
  },
  resendTextDisabled: {
    color: colors.subtext,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  googleIconImage: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  googleText: {
    fontSize: 16.5,
    fontWeight: "700",
    color: colors.heading,
  },
});
