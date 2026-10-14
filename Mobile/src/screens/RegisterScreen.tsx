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
} from "../components/ui";
import { fonts } from "../theme";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { styles as s } from "./styles/RegisterScreen.styles";

export default function RegisterScreen() {
  const nav = useNavigation<any>();
  const { register, loginWithGoogle } = useAuth() as any;

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

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
              source={require("../../assets/icon.png")}
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
                <TurnstileBox onToken={setTurnstileToken} />
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
              source={require("../../assets/Google__G__logo.webp")}
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
