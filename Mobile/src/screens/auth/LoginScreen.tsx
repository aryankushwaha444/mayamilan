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
  StyleSheet,
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
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { fonts, colors } from "../../theme";

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
              source={require("../../../assets/icon.png")}
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
              source={require("../../../assets/Google__G__logo.webp")}
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  header: { alignItems: "center", marginBottom: 24 },
  logo: { width: 68, height: 68, borderRadius: 12, marginBottom: 8 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.heading,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 15.5, color: colors.subtext, textAlign: "center" },
  forgotRow: { alignItems: "flex-end", marginTop: 12, marginBottom: 8 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.inputBorder },
  dividerText: {
    marginHorizontal: 12,
    color: colors.subtext,
    fontSize: 15,
    fontWeight: "600",
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
    marginBottom: 12,
  },
  googleIcon: { width: 20, height: 20, marginRight: 10 },
  googleText: { fontSize: 16.5, fontWeight: "700", color: colors.heading },
  err: {
    color: colors.danger,
    textAlign: "center",
    marginTop: 14,
    fontSize: 15,
    fontWeight: "600",
  },
});
