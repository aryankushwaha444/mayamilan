import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { colors, brand, radius, cardShadow } from "../../theme";

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.msg}>{message}</Text>}
          <View style={styles.actions}>
            <Pressable
              style={styles.cancel}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirm, danger && styles.danger]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  box: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
    gap: 10,
    ...cardShadow,
  },
  title: { fontSize: 17, fontWeight: "800", color: colors.heading },
  msg: { fontSize: 14, color: colors.subtext, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: colors.inputFill,
    alignItems: "center",
  },
  cancelText: { color: colors.subtext, fontWeight: "700" },
  confirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: brand.from,
    alignItems: "center",
  },
  danger: { backgroundColor: colors.danger },
  confirmText: { color: "#fff", fontWeight: "700" },
});
