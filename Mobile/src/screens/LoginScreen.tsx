// src/screens/LoginScreen.tsx
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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Card,
  AuthHeader,
  Field,
  GradientButton,
  GoogleButton,
  LinkRow,
} from "../components/ui";
import { TurnstileBox } from "../components/TurnstileBox";
import { useAuth } from "../context/AuthContext";
import { colors, fonts } from "../theme";

type Nav = NativeStackNavigationProp<any>;

export default function LoginScreen() {
  const nav = useNavigation<Nav>();
  const { login } = useAuth();
  const { height } = useWindowDimensions();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstile, setTurnstile] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!email.trim() || !password)
      return setErr("Enter your email and password.");
    if (!turnstile) return setErr("Complete the security check."); // fail-closed
    setBusy(true);
    try {
      await login(email.trim(), password, turnstile); // token reaches server (3-arg login)
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Login failed.");
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
            title="Welcome Back"
            subtitle="Sign in to continue your journey."
          />
          <Field
            label="Email Address"
            icon="mail-outline"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            label="Password"
            icon="lock-closed-outline"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="current-password"
          />
          <TurnstileBox onToken={setTurnstile} />
          <GradientButton title="Login" onPress={submit} loading={busy} />
          <View style={s.forgotRow}>
            <Text
              style={fonts.link}
              onPress={() => nav.navigate("ForgotPassword")}
            >
              Forgot Password?
            </Text>
          </View>
          <View style={s.divider} />
          <GoogleButton
            title="Continue with Google"
            onPress={() => {
              /* native Google, next step */
            }}
          />
          <LinkRow
            text="Don't have an account?"
            link="Sign up"
            onPress={() => nav.navigate("Register")}
          />
          {!!err && (
            <Text style={s.err} accessibilityRole="alert">
              {err}
            </Text>
          )}
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
  forgotRow: { alignItems: "flex-end", marginTop: 12 },
  divider: {
    height: 1,
    backgroundColor: colors.inputBorder,
    marginVertical: 18,
  },
  err: {
    color: colors.danger,
    textAlign: "center",
    marginTop: 14,
    fontSize: 14,
  },
});
