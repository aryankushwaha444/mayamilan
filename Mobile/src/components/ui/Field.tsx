import { useState, type ComponentProps } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, space, fonts } from "../../theme";

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

export default function Field({
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
    <View style={styles.wrap}>
      <Text style={fonts.label}>{label}</Text>
      <View
        style={[styles.row, error ? { borderColor: colors.danger } : undefined]}
      >
        {icon && (
          <View style={styles.lead}>
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
            style={styles.trail}
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
const styles = StyleSheet.create({
  wrap: { marginBottom: space.fieldGap },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputFill,
    borderColor: colors.inputBorder,
    borderWidth: 1,
    borderRadius: radius.field,
    height: 52,
    overflow: "hidden",
  },
  lead: {
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
  trail: {
    width: 46,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: colors.inputBorder,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 6 },
});
