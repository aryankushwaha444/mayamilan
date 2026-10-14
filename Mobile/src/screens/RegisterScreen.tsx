// src/screens/RegisterScreen.tsx
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
  GoogleButton,
  LinkRow,
  Stepper,
} from "../components/ui";
import { colors, fonts } from "../theme";

export default function RegisterScreen() {
  const nav = useNavigation<any>();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const next = () => {
    setErr("");
    if (!name.trim()) return setErr("Enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email.");
    if (password.length < 8)
      return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("Passwords do not match.");
    // TODO: persist step-1 to your multi-step register endpoint, then advance.
    setStep((n) => Math.min(4, n + 1));
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
            title="Create Your Account"
            subtitle="Find meaningful connections that matter."
          />
          <Stepper current={step} />
          <Text style={s.section}>Let's create your account</Text>

          {step === 1 && (
            <>
              <Field
                label="Full Name"
                icon="person-outline"
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
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
                placeholder="Minimum 8 characters"
                value={password}
                onChangeText={setPassword}
                secure
                autoComplete="new-password"
              />
              <Field
                label="Confirm Password"
                icon="shield-checkmark-outline"
                placeholder="Confirm your password"
                value={confirm}
                onChangeText={setConfirm}
                secure
                autoComplete="new-password"
              />
            </>
          )}

          <GradientButton title="Continue" iconRight onPress={next} />
          <LinkRow
            text="Already have an account?"
            link="Login"
            onPress={() => nav.navigate("Login")}
          />
          <View style={s.divider} />
          <GoogleButton
            title="Sign up with Google"
            onPress={() => {
              /* native Google, next step */
            }}
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
  section: { ...fonts.label, fontSize: 17, marginBottom: 16 },
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
