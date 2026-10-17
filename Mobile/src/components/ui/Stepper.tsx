import { Fragment } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { brand, colors } from "../../theme";

const DEFAULT_STEPS = ["Account", "About You", "Preferences", "Verify"];

export default function Stepper({
  currentStep,
  totalSteps = 4,
}: {
  currentStep: number;
  totalSteps?: number;
}) {
  const steps = DEFAULT_STEPS.slice(0, totalSteps);
  return (
    <View
      style={styles.stepper}
      accessibilityLabel={`Step ${currentStep} of ${totalSteps}`}
    >
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === currentStep;
        const done = n < currentStep;
        return (
          <Fragment key={label}>
            <View style={styles.col}>
              <LinearGradient
                colors={
                  active || done
                    ? [brand.from, brand.to]
                    : [colors.stepperInactiveFill, colors.stepperInactiveFill]
                }
                start={brand.start}
                end={brand.end}
                style={styles.dot}
              >
                {done ? (
                  <MaterialCommunityIcons name="check" size={16} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.num,
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
                  styles.label,
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
            {i < steps.length - 1 && <View style={styles.line} />}
          </Fragment>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 26,
    paddingHorizontal: 4,
  },
  col: { alignItems: "center", flex: 1 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  num: { fontSize: 14, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "center" },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.stepperInactiveFill,
    marginTop: 16,
    marginBottom: 18,
    marginHorizontal: 4,
  },
});
