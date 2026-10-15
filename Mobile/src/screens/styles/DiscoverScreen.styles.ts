// src/screens/styles/DiscoverScreen.styles.ts
import { StyleSheet, Dimensions } from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// Safe colors fallback in case theme is missing specific keys
const C = {
  bg: "#ffffff",
  text: "#1e293b",
  subtext: "#64748b",
  border: "#e2e8f0",
  primary: "#8b5cf6", // Violet
  danger: "#ef4444",
  link: "#3b82f6",
  white: "#ffffff",
  card: "#ffffff",
};

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  headerBrandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "900", color: C.text },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  filterDrawer: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: C.text,
  },
  applyFilterBtn: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    marginTop: 8,
  },
  applyFilterText: { color: C.white, fontWeight: "700" },

  scrollView: { flex: 1 },
  profileCard: {
    padding: 20,
    alignItems: "center",
    backgroundColor: C.card,
    minHeight: SCREEN_HEIGHT - 200,
  },

  photoContainer: { alignItems: "center", marginBottom: 20 },
  profilePhoto: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#e2e8f0",
  },
  photoDots: { flexDirection: "row", gap: 6, marginTop: 10 },
  photoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#cbd5e1",
  },
  photoDotActive: { backgroundColor: C.primary, width: 24 },

  nameSection: { alignItems: "center", marginTop: 16 },
  nameText: { fontSize: 24, fontWeight: "700", color: C.text },
  infoText: { color: C.subtext, fontSize: 14, marginTop: 4 },

  bioSection: { marginTop: 20, paddingHorizontal: 20 },
  bioText: { color: C.text, fontSize: 14, lineHeight: 22, textAlign: "center" },

  navigationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 30,
    marginBottom: 20,
  },
  navigationText: { color: C.subtext, fontSize: 14, fontWeight: "600" },

  actionButtonsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 16,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  passButton: { backgroundColor: C.white, borderColor: C.danger },
  profileButton: { backgroundColor: C.white, borderColor: C.link },
  likeButton: { backgroundColor: C.primary, borderColor: C.primary },

  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: C.subtext, marginTop: 12 },
  noMoreTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  refreshBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  refreshBtnText: { color: C.white, fontWeight: "700" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: C.text },
  modalContent: { flex: 1 },
  detailCardText: {
    fontSize: 14,
    color: C.text,
    marginBottom: 12,
    lineHeight: 20,
  },
});
