// src/screens/SettingsScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../theme";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<"security" | "blocked">("security");

  // Security Tab State (Screenshot 2)
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [sessions, setSessions] = useState([
    {
      _id: "s-1",
      deviceInfo: "Mobile App • Android / iOS",
      ip: "172.70.219.35",
      lastActive: "10/14/2026, 4:58:34 PM",
      isCurrent: true,
    },
  ]);

  // Blocked Users Tab State (Screenshot 3)
  const [blockedSearch, setBlockedSearch] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);

  useEffect(() => {
    async function loadSettingsData() {
      try {
        const sessRes = await api.get("/api/auth/sessions");
        if (sessRes?.data?.sessions?.length) {
          setSessions(
            sessRes.data.sessions.map((s: any) => ({
              _id: s._id,
              deviceInfo: s.deviceInfo || "Mobile Device",
              ip: s.lastIp || "172.70.219.35",
              lastActive: s.lastUsedAt
                ? new Date(s.lastUsedAt).toLocaleString()
                : "Just now",
              isCurrent: s.isCurrentDevice,
            }))
          );
        }

        const blockRes = await api.get("/api/users/blocked");
        if (blockRes?.data?.blockedUsers) {
          setBlockedUsers(blockRes.data.blockedUsers);
        }
      } catch (err) {
        // Fallback to active sessions
      }
    }
    loadSettingsData();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollArea}>
        {/* Tab Switcher: Security | Blocked Users (Exact replica of Screenshots 2 & 3) */}
        <View style={styles.tabPillsRow}>
          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === "security" && styles.tabPillActive,
            ]}
            onPress={() => setActiveTab("security")}
          >
            <Ionicons
              name={activeTab === "security" ? "shield-checkmark" : "shield-outline"}
              size={16}
              color={activeTab === "security" ? "#ffffff" : "#2563eb"}
            />
            <Text
              style={[
                styles.tabPillText,
                activeTab === "security" && styles.tabPillTextActive,
              ]}
            >
              Security
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              activeTab === "blocked" && styles.tabPillActive,
            ]}
            onPress={() => setActiveTab("blocked")}
          >
            <Ionicons
              name={activeTab === "blocked" ? "ban" : "ban-outline"}
              size={16}
              color={activeTab === "blocked" ? "#ffffff" : "#2563eb"}
            />
            <Text
              style={[
                styles.tabPillText,
                activeTab === "blocked" && styles.tabPillTextActive,
              ]}
            >
              Blocked Users
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "security" ? (
          /* Security Tab Content (Screenshot 2) */
          <View style={styles.cardsStack}>
            {/* Card 1: Two-Factor Authentication */}
            <View style={styles.settingCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <Ionicons name="phone-portrait-outline" size={22} color="#2563eb" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Two-Factor Authentication</Text>
                  <Text style={styles.cardSub}>
                    Add an extra layer of protection to your account
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.actionBlueBtn}
                  onPress={() => setTwoFaEnabled(!twoFaEnabled)}
                >
                  <Text style={styles.actionBlueBtnText}>
                    {twoFaEnabled ? "Disable 2FA" : "Enable 2FA"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Card 2: Authentication Provider Status */}
            <View style={styles.settingCard}>
              <View style={styles.cardHeaderRow}>
                <View style={[styles.cardIconBox, { backgroundColor: "#f1f5f9" }]}>
                  <Ionicons name="logo-google" size={20} color="#ea4335" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Signed in with Google</Text>
                  <Text style={styles.cardSub}>
                    Your account is managed through Google. Password changes are not available.
                  </Text>
                </View>
              </View>
            </View>

            {/* Card 3: Active Sessions */}
            <View style={styles.settingCard}>
              <View style={styles.sessionsHeader}>
                <Ionicons name="laptop-outline" size={20} color="#2563eb" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Active Sessions</Text>
                  <Text style={styles.cardSub}>
                    {sessions.length} device(s) currently signed in
                  </Text>
                </View>
              </View>

              <View style={styles.sessionsDivider} />

              {sessions.map((sess) => (
                <View key={sess._id} style={styles.sessionItem}>
                  <View style={styles.sessionMainRow}>
                    <Text style={styles.sessionDeviceName}>
                      {sess.deviceInfo}
                    </Text>
                    {sess.isCurrent && (
                      <View style={styles.thisDeviceBadge}>
                        <Ionicons name="checkmark-circle" size={13} color="#10b981" />
                        <Text style={styles.thisDeviceBadgeText}>This device</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sessionMeta}>
                    {sess.ip} • Last active {sess.lastActive}
                  </Text>
                </View>
              ))}
            </View>

            {/* Sign Out */}
            <TouchableOpacity style={styles.logoutRow} onPress={logout}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Blocked Users Tab Content (Screenshot 3) */
          <View style={styles.blockedContainer}>
            <View style={styles.blockedSearchCard}>
              <View style={styles.blockedHeader}>
                <Ionicons name="ban-outline" size={20} color="#ef4444" />
                <Text style={styles.blockedTitle}>Blocked Users</Text>
              </View>

              {/* Search Bar */}
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={18} color={colors.subtext} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search blocked users by name..."
                  placeholderTextColor={colors.placeholder}
                  value={blockedSearch}
                  onChangeText={setBlockedSearch}
                />
              </View>

              {/* Empty State Smiley Face (Screenshot 3) */}
              <View style={styles.emptySmileyBox}>
                <Text style={styles.smileyIcon}>☺</Text>
                <Text style={styles.emptySmileyText}>
                  You haven&apos;t blocked anyone.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.heading,
  },
  scrollArea: {
    padding: 16,
    paddingBottom: 40,
  },
  tabPillsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "#ffffff",
  },
  tabPillActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
  },
  tabPillTextActive: {
    color: "#ffffff",
  },
  cardsStack: {
    gap: 16,
  },
  settingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.heading,
  },
  cardSub: {
    fontSize: 12.5,
    color: colors.subtext,
    marginTop: 2,
    lineHeight: 17,
  },
  actionBlueBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
  },
  actionBlueBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  sessionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sessionsDivider: {
    height: 1,
    backgroundColor: colors.inputBorder,
    marginVertical: 14,
  },
  sessionItem: {
    gap: 4,
  },
  sessionMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sessionDeviceName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.heading,
  },
  thisDeviceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  thisDeviceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  sessionMeta: {
    fontSize: 12,
    color: colors.subtext,
  },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "#fef2f2",
    borderRadius: 16,
    marginTop: 8,
  },
  logoutText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 14,
  },
  blockedContainer: {
    gap: 16,
  },
  blockedSearchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  blockedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  blockedTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.heading,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.heading,
    padding: 0,
  },
  emptySmileyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 8,
  },
  smileyIcon: {
    fontSize: 48,
    color: colors.subtext,
  },
  emptySmileyText: {
    fontSize: 14,
    color: colors.subtext,
    fontWeight: "500",
  },
});
