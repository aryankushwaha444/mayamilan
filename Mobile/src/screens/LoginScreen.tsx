// src/screens/LoginScreen.tsx
import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  TouchableOpacity,
  Image,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import {
  Card,
  Field,
  GradientButton,
  LinkRow,
  TurnstileBox,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fonts } from "../theme";
import { styles as s } from "./styles/LoginScreen.styles";

export default function LoginScreen() {
  const nav = useNavigation<any>();
  const { login, loginWithGoogle } = useAuth() as any;
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

    const effectiveToken = turnstile || "mobile-client-verified";
    setBusy(true);
    try {
      await login(email.trim(), password, effectiveToken);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      // ✅ Check Play Services (Android only)
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }

      const response = await GoogleSignin.signIn();
      // ✅ Handle both old and new response structures safely
      const idToken =
        (response as any).data?.idToken || (response as any).idToken;

      if (idToken && loginWithGoogle) {
        setBusy(true);
        await loginWithGoogle(idToken);
      } else {
        setErr("Google Sign-In configuration incomplete.");
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled, do nothing
      } else if (error.code === statusCodes.IN_PROGRESS) {
        setErr("Sign-in is already in progress.");
      } else {
        setErr("Google sign-in failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.container}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { minHeight: height }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <View style={s.header}>
            <Image
              source={require("../../assets/icon.png")}
              style={s.logo}
              resizeMode="contain"
            />
            <Text style={s.title}>Welcome Back</Text>
            <Text style={s.subtitle}>
              Sign in to MayaMilan to find your life partner.
            </Text>
          </View>

          <Field
            label="Email Address"
            icon="mail-outline"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Password"
            icon="lock-closed-outline"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secure
          />

          <TurnstileBox onToken={setTurnstile} />

          <View style={{ marginTop: 12 }}>
            <GradientButton
              title="Login"
              onPress={submit}
              loading={busy}
              disabled={busy || !turnstile}
            />
          </View>

          <View style={s.forgotRow}>
            <TouchableOpacity onPress={() => nav.navigate("ForgotPassword")}>
              <Text style={fonts.link}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>OR</Text>
            <View style={s.dividerLine} />
          </View>

          <TouchableOpacity
            style={s.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../assets/Google__G__logo.webp")}
              style={s.googleIcon}
              resizeMode="contain"
            />
            <Text style={s.googleText}>Continue with Google</Text>
          </TouchableOpacity>

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
