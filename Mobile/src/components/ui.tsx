// src/components/ui.tsx
import { useState, Fragment, type ComponentProps } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  colors,
  brand,
  radius,
  space,
  cardShadow,
  btnShadow,
  fonts,
} from "../theme";

// Re-export TurnstileBox so it can be imported directly from ui
export { TurnstileBox } from "./TurnstileBox";

type TextInputOwnProps = ComponentProps<typeof TextInput>;
type AutoComplete = NonNullable<TextInputOwnProps["autoComplete"]>;
type ContentType = NonNullable<TextInputOwnProps["textContentType"]>;

function iosContentType(ac?: AutoComplete): ContentType | undefined {
  switch (ac) {
    case "email":
      return "emailAddress";
    case "name":
      return "name";
    case "current-password":
      return "password";
    case "new-password":
      return "newPassword";
    case "one-time-code":
      return "oneTimeCode";
    default:
      return undefined;
  }
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function BrandIcon({ size = 68 }: { size?: number }) {
  return (
    <LinearGradient
      colors={[brand.from, brand.to]}
      start={brand.start}
      end={brand.end}
      style={[
        styles.brandIcon,
        { width: size, height: size, borderRadius: radius.icon },
      ]}
      accessibilityLabel="Maya Milan"
    >
      <Ionicons name="heart" size={size * 0.46} color="#fff" />
    </LinearGradient>
  );
}

export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.header}>
      <BrandIcon />
      <Text style={[fonts.h1, styles.headerTitle]}>{title}</Text>
      <Text style={[fonts.sub, styles.headerSub]}>{subtitle}</Text>
    </View>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  icon?: keyof typeof Ionicons.glyphMap;
  placeholder?: string;
  secure?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "number-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: AutoComplete;
  error?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  icon,
  placeholder,
  secure,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
  autoComplete,
  error,
}: FieldProps) {
  const [reveal, setReveal] = useState(false);
  const isSecret = !!secure || !!secureTextEntry;

  return (
    <View style={styles.fieldWrap}>
      <Text style={fonts.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          error ? { borderColor: colors.danger } : undefined,
        ]}
      >
        {icon && (
          <View style={styles.leadCell}>
            <Ionicons name={icon} size={20} color={colors.iconTint} />
          </View>
        )}
        <TextInput
          style={[styles.input, fonts.input]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={isSecret && !reveal}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={iosContentType(autoComplete)}
          accessibilityLabel={label}
        />
        {isSecret && (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            style={styles.trailCell}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={reveal ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={reveal ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.iconTint}
            />
          </Pressable>
        )}
      </View>
      {!!error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

export function GradientButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        pressed && !disabled && { opacity: 0.92 },
        disabled && { opacity: 0.6 },
      ]}
    >
      <LinearGradient
        colors={[brand.from, brand.to]}
        start={brand.start}
        end={brand.end}
        style={[styles.gradBtn, btnShadow]}
      >
        {loading ? (
          <Ionicons
            name="hourglass-outline"
            size={20}
            color="#fff"
            style={{ marginRight: 8 }}
          />
        ) : (
          <Ionicons
            name="arrow-forward"
            size={18}
            color="#fff"
            style={{ marginRight: 8 }}
          />
        )}
        <Text style={fonts.btn}>{loading ? "Please wait…" : title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GoogleButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.9 }]}
    >
      <Ionicons name="logo-google" size={20} color="#ea4335" />
      <Text style={styles.googleText}>{title}</Text>
    </Pressable>
  );
}

export function LinkRow({
  text,
  link,
  actionText,
  onPress,
}: {
  text: string;
  link?: string;
  actionText?: string;
  onPress: () => void;
}) {
  const displayAction = actionText || link || "";
  return (
    <View style={styles.linkRow}>
      <Text style={fonts.muted}>{text} </Text>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel={displayAction}
      >
        <Text style={fonts.link}>{displayAction}</Text>
      </Pressable>
    </View>
  );
}

// ✅ Updated to exactly match the web app's 4-step process
const DEFAULT_STEPS = ["Account", "About You", "Preferences", "Verify"];

export function Stepper({
  currentStep,
  totalSteps = 4,
}: {
  currentStep: number;
  totalSteps?: number;
}) {
  const activeStep = currentStep;
  const count = totalSteps;
  const steps = DEFAULT_STEPS.slice(0, count);

  return (
    <View
      style={styles.stepper}
      accessibilityLabel={`Step ${activeStep} of ${count}`}
    >
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === activeStep;
        const done = n < activeStep;
        return (
          <Fragment key={label}>
            <View style={styles.stepCol}>
              <LinearGradient
                colors={
                  active || done
                    ? [brand.from, brand.to]
                    : [colors.stepperInactiveFill, colors.stepperInactiveFill]
                }
                start={brand.start}
                end={brand.end}
                style={[
                  styles.stepDot,
                  !(active || done) && {
                    backgroundColor: colors.stepperInactiveFill,
                  },
                ]}
              >
                {done ? (
                  <MaterialCommunityIcons name="check" size={16} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.stepNum,
                      {
                        color:
                          active || done ? "#fff" : colors.stepperInactiveText,
                      },
                    ]}
                  >
                    {n}
                  </Text>
                )}
              </LinearGradient>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: active
                      ? colors.stepperActiveText
                      : colors.stepperInactiveText,
                  },
                ]}
              >
                {label}
              </Text>
            </View>
            {i < steps.length - 1 && <View style={styles.stepLine} />}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: space.card,
    ...cardShadow,
  },
  brandIcon: { alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 24, gap: 6 },
  headerTitle: { textAlign: "center", marginTop: 6 },
  headerSub: { textAlign: "center" },
  fieldWrap: { marginBottom: space.fieldGap },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputFill,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: radius.field,
    height: 52,
    overflow: "hidden",
  },
  leadCell: {
    width: 48,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: colors.inputBorder,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    height: "100%",
    color: colors.heading,
    fontSize: 16,
  },
  trailCell: {
    width: 46,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: colors.inputBorder,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 6 },
  gradBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: radius.button,
    marginTop: 4,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  googleText: { fontSize: 15.5, fontWeight: "600", color: colors.heading },
  linkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 26,
    paddingHorizontal: 4,
  },
  stepCol: { alignItems: "center", flex: 1 },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: { fontSize: 14, fontWeight: "700" },
  stepLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.stepperInactiveFill,
    marginTop: 16,
    marginBottom: 18,
    marginHorizontal: 4,
  },
});
