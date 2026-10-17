// src/components/chat/PhotoLightbox.tsx
import React from "react";
import { Modal, View, TouchableOpacity, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";
import { isSafeMediaUrl } from "../../utils/media";

export default function PhotoLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  const safe = isSafeMediaUrl(url) ? (url as string) : null;
  return (
    <Modal
      visible={!!safe}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity
          style={s.close}
          onPress={onClose}
          accessibilityLabel="Close"
          hitSlop={10}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </TouchableOpacity>
        {safe ? (
          <Image source={{ uri: safe }} style={s.img} resizeMode="contain" />
        ) : null}
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  close: {
    position: "absolute",
    top: 54,
    right: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
  },
  img: { width: "100%", height: "100%" },
});
