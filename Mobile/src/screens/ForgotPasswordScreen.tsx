// src/screens/ForgotPasswordScreen.tsx
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  Card,
  AuthHeader,
  Field,
  GradientButton,
  LinkRow,
} from "../components/ui";
import { api } from "../api/client";
import { colors } from "../theme";

export default function ForgotPasswordScreen() {
  const nav = useNavigation<any>();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setErr("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      return setErr("Enter a valid email address.");
    setBusy(true);
    try {
      // Match path/field to server/. If your server requires a Turnstile token here,
      // render <TurnstileBox onToken={setTurnstile}/> and include it in the body.
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSent(true); // generic success regardless of whether the email exists
    } catch (e: any) {
      // Never surface "email not found" => that is account enumeration.
      setErr(
        e?.response?.status === 429
          ? "Too many attempts. Please try again later."
          : ""
      );
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { minHeight: height }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <AuthHeader
            title="Reset Password"
            subtitle="Enter your email and we'll send a reset link."
          />
          {sent ? (
            <Text style={s.sent} accessibilityLiveRegion="polite">
              {err ||
                "If that email is registered, a reset link is on its way."}
            </Text>
          ) : (
            <Field
              label="Email Address"
              icon="mail-outline"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
          <GradientButton
            title={sent ? "Done" : "Send Reset Link"}
            iconRight={!sent}
            onPress={() => (sent ? nav.navigate("Login") : void submit())}
            loading={busy}
          />
          {!!err && !sent && (
            <Text style={s.err} accessibilityRole="alert">
              {err}
            </Text>
          )}
          <LinkRow
            text="Remembered it?"
            link="Back to Login"
            onPress={() => nav.navigate("Login")}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: colors.pageBg,
  },
  sent: {
    color: colors.subtext,
    fontSize: 15,
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 22,
  },
  err: {
    color: colors.danger,
    textAlign: "center",
    marginTop: 12,
    fontSize: 14,
  },
});
