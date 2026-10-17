// src/screens/ProfileScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius, cardShadow } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { getMyProfile } from "../../api/user";

const { width } = Dimensions.get("window");

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState<any>(user || {});

  useEffect(() => {
    async function load() {
      try {
        const res = await getMyProfile();
        if (res?.user) setProfile(res.user);
      } catch {}
    }
    load();
  }, [user]);

  const primaryPhoto =
    profile?.photos?.find((p: any) => p.isPrimary)?.url ||
    profile?.photos?.[0]?.url ||
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Navbar */}
      <View style={styles.topNav}>
        <Text style={styles.navTitle}>Matrimonial Biodata</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            style={styles.navIconBtn}
            onPress={() => navigation.navigate("Settings")}
          >
            <Ionicons name="settings-outline" size={20} color={colors.heading} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Hero Card */}
        <View style={[styles.heroCard, cardShadow]}>
          <Image source={{ uri: primaryPhoto }} style={styles.heroImage} />
          <LinearGradient
            colors={["transparent", "rgba(15, 23, 42, 0.85)"]}
            style={styles.heroGradient}
          >
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName}>
                {profile.name || "MayaMilan Member"}
              </Text>
              <Ionicons name="checkmark-circle" size={22} color="#38bdf8" />
            </View>
            <Text style={styles.heroSub}>
              {profile.occupation || "Professional"} • {profile.location?.city || "Kathmandu"}
            </Text>
          </LinearGradient>
        </View>

        {/* Quick Action Button */}
        <TouchableOpacity
          style={styles.editProfileBtn}
          onPress={() => navigation.navigate("EditProfile")}
        >
          <Ionicons name="pencil" size={18} color="#ffffff" />
          <Text style={styles.editProfileBtnText}>Edit Matrimonial Biodata</Text>
        </TouchableOpacity>

        {/* Section 1: About Me & Bio */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>About Me</Text>
          <Text style={styles.bioText}>
            {profile.bio ||
              "Namaste! Welcome to my matrimonial profile. Looking forward to connecting with someone who values family, culture, and mutual growth."}
          </Text>
        </View>

        {/* Section 2: Astrology & Horoscope (Kundali) */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="moon" size={18} color={brand.to} />
            <Text style={styles.sectionTitle}>Horoscope &amp; Astrological Details</Text>
          </View>
          <View style={styles.gridDetails}>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Rashi (Zodiac)</Text>
              <Text style={styles.itemValue}>{profile.rashi || "Tula (Libra)"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Gotra</Text>
              <Text style={styles.itemValue}>{profile.gotra || "Kashyap"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Religion</Text>
              <Text style={styles.itemValue}>{profile.religion || "Hinduism"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Caste / Community</Text>
              <Text style={styles.itemValue}>{profile.caste || "Brahmin"}</Text>
            </View>
          </View>
        </View>

        {/* Section 3: Education & Career */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="school" size={18} color={brand.to} />
            <Text style={styles.sectionTitle}>Education &amp; Career</Text>
          </View>
          <View style={styles.gridDetails}>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Highest Degree</Text>
              <Text style={styles.itemValue}>{profile.education || "Master's Degree"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Occupation</Text>
              <Text style={styles.itemValue}>{profile.occupation || "Software Engineer"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Height</Text>
              <Text style={styles.itemValue}>{profile.height || "5 ft 6 in"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Diet</Text>
              <Text style={styles.itemValue}>{profile.diet || "Vegetarian"}</Text>
            </View>
          </View>
        </View>

        {/* Section 4: Family Background */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="people" size={18} color={brand.to} />
            <Text style={styles.sectionTitle}>Family Background</Text>
          </View>
          <View style={styles.gridDetails}>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Family Type</Text>
              <Text style={styles.itemValue}>{profile.familyType || "Nuclear Family"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Family Values</Text>
              <Text style={styles.itemValue}>Traditional &amp; Progressive</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Origin City</Text>
              <Text style={styles.itemValue}>{profile.location?.city || "Kathmandu"}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.itemLabel}>Country</Text>
              <Text style={styles.itemValue}>{profile.location?.country || "Nepal"}</Text>
            </View>
          </View>
        </View>

        {/* Log Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out from MayaMilan</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.heading,
  },
  navIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  heroCard: {
    width: "100%",
    height: 280,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
  },
  heroNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  heroSub: {
    fontSize: 14,
    color: "#cbd5e1",
    marginTop: 2,
  },
  editProfileBtn: {
    backgroundColor: brand.to,
    paddingVertical: 13,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  editProfileBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.label,
  },
  gridDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  gridItem: {
    width: "48%",
    backgroundColor: colors.inputFill,
    padding: 10,
    borderRadius: 12,
  },
  itemLabel: {
    fontSize: 11,
    color: colors.subtext,
    fontWeight: "600",
  },
  itemValue: {
    fontSize: 14,
    color: colors.heading,
    fontWeight: "700",
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    marginTop: 8,
  },
  logoutText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 15,
  },
});
