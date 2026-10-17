// src/components/discovery/MatchCard.tsx
// Extracted from DiscoverScreen's inline "It's a Match!" modal. Presentational only; the
// screen owns setMatchAlert + the Messages navigation. No remote URLs rendered (heart icon +
// name text only), so no media gate is needed here — but it is kept separate so the discovery
// barrel has a clean two-component surface.
import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, brand, radius, cardShadow } from "../../theme";
import type { CandidateUser } from "../../api/discovery";

interface Props {
  user: CandidateUser | null;
  onClose: () => void;
  onSendMessage: () => void;
}

export default function MatchCard({ user, onClose, onSendMessage }: Props) {
  return (
    <Modal
      visible={!!user}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={st.backdrop}>
        <View style={st.card}>
          <View style={st.iconBox}>
            <Ionicons name="heart" size={36} color={colors.white} />
          </View>
          <Text style={st.title}>It's a Match!</Text>
          <Text style={st.sub}>
            You and {user?.name} have expressed mutual matrimonial interest.
          </Text>
          <TouchableOpacity style={st.actionBtn} onPress={onSendMessage}>
            <Ionicons
              name="chatbubble-ellipses"
              size={16}
              color={colors.white}
            />
            <Text style={st.actionText}>Send First Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.dismissBtn} onPress={onClose}>
            <Text style={st.dismissText}>Keep Browsing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    ...cardShadow,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: brand.from,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.heading },
  sub: {
    fontSize: 13,
    color: colors.subtext,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: brand.from,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.button,
    marginTop: 20,
    width: "100%",
    justifyContent: "center",
  },
  actionText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  dismissBtn: { marginTop: 10, paddingVertical: 8 },
  dismissText: { color: colors.subtext, fontSize: 12, fontWeight: "600" },
});
