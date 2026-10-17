// src/screens/RegisterScreen.tsx
import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import {
  Card,
  Field,
  GradientButton,
  LinkRow,
  Stepper,
  TurnstileBox,
} from "../../components/ui";
import { fonts, colors } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { useTurnstile } from "../../hooks/useTurnstile";

export default function RegisterScreen() {
  const nav = useNavigation<any>();
  const { register, loginWithGoogle } = useAuth() as any;

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const {
    token: turnstileToken,
    onToken: setTurnstileToken,
    challengeKey: turnstileKey,
    reset: resetTurnstile,
  } = useTurnstile();
  // Form Load Time for security
  const [formLoadTime] = useState(Date.now());

  // Step 1: Account
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2: About You
  const [dateOfBirth, setDateOfBirth] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState("");

  // Step 3: Preferences
  const [relationshipGoal, setRelationshipGoal] = useState("");

  // Step 4: Verify (OTP)
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const otpInputRef = useRef<TextInput>(null);

  // Honeypot field (hidden from users)
  const [website, setWebsite] = useState("");

  useEffect(() => {
    if (step === 4 && otpInputRef.current) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [step]);

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOTP = async () => {
    setErr("");
    resetTurnstile();
    setOtpLoading(true);

    try {
      await api.post("/auth/send-otp", {
        email: email.trim(),
        name: name.trim(),
        website: website, // Honeypot
        _formLoadTime: formLoadTime,
      });

      startResendTimer();
    } catch (error: any) {
      setErr(error?.response?.data?.message || "Failed to send OTP");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!turnstileToken) {
      return setErr("Please complete the security check.");
    }

    if (!otp || otp.length !== 6) {
      return setErr("Please enter a valid 6-digit OTP");
    }

    setOtpLoading(true);

    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        dateOfBirth: dateOfBirth.toISOString().split("T")[0],
        gender,
        relationshipGoal,
        turnstileToken,
        website,
        _formLoadTime: formLoadTime,
      } as any);
    } catch (error: any) {
      setErr(error?.response?.data?.message || "Registration failed");
      resetTurnstile();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleNext = () => {
    setErr("");

    if (step === 1) {
      if (!name.trim()) return setErr("Please enter your name");
      if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email");
      if (password.length < 8)
        return setErr("Password must be at least 8 characters");
      if (password !== confirmPassword) return setErr("Passwords do not match");
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!gender) return setErr("Please select your gender");
      if (!dateOfBirth) return setErr("Please select your date of birth");
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!relationshipGoal)
        return setErr("Please select your relationship goal");
      setStep(4);
      handleSendOTP();
      return;
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }

      const response = await GoogleSignin.signIn();
      const idToken =
        (response as any).data?.idToken || (response as any).idToken;

      if (idToken && loginWithGoogle) {
        setBusy(true);
        await loginWithGoogle(idToken);
      } else {
        setErr("Google Sign-In configuration incomplete.");
      }
    } catch (error: any) {
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        setErr("Google sign-in failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const getStrength = (pwd: string) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const strength = getStrength(password);
  const strengthLabels = [
    "Too weak",
    "Weak",
    "Fair",
    "Good",
    "Strong",
    "Very strong",
  ];
  const strengthColors = [
    "#ef4444",
    "#ef4444",
    "#f59e0b",
    "#eab308",
    "#22c55e",
    "#16a34a",
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.container}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <View style={s.header}>
            <Image
              source={require("../../../assets/icon.png")}
              style={s.logo}
              resizeMode="contain"
            />
            <Text style={s.title}>Create Your Account</Text>
            <Text style={s.subtitle}>
              Find meaningful connections that matter.
            </Text>
          </View>

          <Stepper currentStep={step} totalSteps={4} />

          {err ? (
            <View style={s.errBox}>
              <Text style={s.errTxt}>{err}</Text>
            </View>
          ) : null}

          <TextInput
            style={{ display: "none" }}
            value={website}
            onChangeText={setWebsite}
            autoCapitalize="none"
            testID="honeypot"
          />

          {step === 1 && (
            <View style={{ gap: 12 }}>
              <Field
                label="Full Name"
                icon="person-outline"
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
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
                autoCapitalize="none"
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

              {password.length > 0 && (
                <View style={s.strengthContainer}>
                  <View style={s.strengthBar}>
                    <View
                      style={[
                        s.strengthFill,
                        {
                          width: `${(strength / 5) * 100}%`,
                          backgroundColor: strengthColors[strength],
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      s.strengthText,
                      { color: strengthColors[strength] },
                    ]}
                  >
                    {strengthLabels[strength]}
                  </Text>
                </View>
              )}

              <Field
                label="Confirm Password"
                icon="shield-checkmark-outline"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secure
                autoComplete="new-password"
              />
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 14 }}>
              <Text style={fonts.label}>Date of Birth</Text>
              <TouchableOpacity
                style={s.input}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={fonts.input}>
                  {dateOfBirth.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={dateOfBirth}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  maximumDate={
                    new Date(
                      new Date().setFullYear(new Date().getFullYear() - 18)
                    )
                  }
                  onChange={(
                    event: DateTimePickerEvent,
                    selectedDate?: Date
                  ) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (selectedDate) setDateOfBirth(selectedDate);
                  }}
                />
              )}

              <Text style={fonts.label}>Gender</Text>
              <View style={s.pickerRow}>
                {["Male", "Female", "Non-binary", "Other"].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[s.chip, gender === g.toLowerCase() && s.chipActive]}
                    onPress={() => setGender(g.toLowerCase())}
                  >
                    <Text
                      style={[
                        s.chipText,
                        gender === g.toLowerCase() && s.chipTextActive,
                      ]}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={{ gap: 14 }}>
              <Text style={fonts.label}>What are you looking for?</Text>
              <View style={s.goalRow}>
                {[
                  { id: "serious", icon: "❤️", label: "Serious Relationship" },
                  { id: "marriage", icon: "⭐", label: "Marriage" },
                  { id: "friendship", icon: "👥", label: "Friendship" },
                  { id: "casual", icon: "💬", label: "Casual Dating" },
                ].map((goal) => (
                  <TouchableOpacity
                    key={goal.id}
                    style={[
                      s.goalCard,
                      relationshipGoal === goal.id && s.goalCardActive,
                    ]}
                    onPress={() => setRelationshipGoal(goal.id)}
                  >
                    <Text style={s.goalIcon}>{goal.icon}</Text>
                    <Text
                      style={[
                        s.goalLabel,
                        relationshipGoal === goal.id && s.goalLabelActive,
                      ]}
                    >
                      {goal.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {step === 4 && (
            <View style={{ gap: 14 }}>
              <Text style={[fonts.sub, { textAlign: "center" }]}>
                We've sent a 6-digit verification code to{" "}
                <Text style={{ fontWeight: "700" }}>{email}</Text>
              </Text>

              <Text style={fonts.label}>Enter OTP</Text>
              <TextInput
                ref={otpInputRef}
                style={s.otpInput}
                placeholder="000000"
                maxLength={6}
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                autoComplete="one-time-code"
              />

              <View style={{ marginTop: 8 }}>
              <TurnstileBox key={turnstileKey} onToken={setTurnstileToken} />
              </View>

              <TouchableOpacity
                style={s.resendBtn}
                onPress={handleSendOTP}
                disabled={resendTimer > 0 || otpLoading}
              >
                <Text
                  style={[
                    s.resendText,
                    resendTimer > 0 && s.resendTextDisabled,
                  ]}
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ marginTop: 20, gap: 12 }}>
            <GradientButton
              title={
                step === 4
                  ? otpLoading
                    ? "Verifying..."
                    : "Verify & Create Account"
                  : step === 3
                  ? "Continue"
                  : "Next Step"
              }
              onPress={step === 4 ? handleVerifyOTP : handleNext}
              loading={busy || (step === 4 && otpLoading)}
              disabled={
                step === 4 && (!otp || otp.length !== 6 || !turnstileToken)
              }
            />

            {step > 1 && step < 4 && (
              <TouchableOpacity
                onPress={() => setStep((s) => s - 1)}
                style={{ alignItems: "center" }}
              >
                <Text style={fonts.link}>← Back to previous step</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={s.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../../assets/Google__G__logo.webp")}
              style={s.googleIconImage}
              resizeMode="contain"
            />
            <Text style={s.googleText}>Sign up with Google</Text>
          </TouchableOpacity>

          <LinkRow
            text="Already have an account?"
            link="Login"
            onPress={() => nav.navigate("Login")}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { flexGrow: 1, padding: 20 },
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
  errBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errTxt: { color: colors.danger, fontSize: 13 },
  strengthContainer: { marginTop: 8, marginBottom: 4 },
  strengthBar: {
    height: 6,
    backgroundColor: colors.inputBorder,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  strengthFill: { height: "100%", borderRadius: 3 },
  strengthText: { fontSize: 13, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.inputFill,
    marginBottom: 12,
  },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
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
  chipText: { fontSize: 15, color: colors.subtext, fontWeight: "600" },
  chipTextActive: { color: colors.white, fontWeight: "700" },
  goalRow: { gap: 12 },
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
  goalCardActive: { borderColor: colors.iconTint, backgroundColor: "#f3e8ff" },
  goalIcon: { fontSize: 24 },
  goalLabel: { fontSize: 15, color: colors.subtext, fontWeight: "600" },
  goalLabelActive: { color: colors.iconTint, fontWeight: "700" },
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
  resendBtn: { marginTop: 8, alignItems: "center" },
  resendText: { color: colors.link, fontSize: 15, fontWeight: "600" },
  resendTextDisabled: { color: colors.subtext },
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
  googleIconImage: { width: 20, height: 20, marginRight: 10 },
  googleText: { fontSize: 16.5, fontWeight: "700", color: colors.heading },
});
