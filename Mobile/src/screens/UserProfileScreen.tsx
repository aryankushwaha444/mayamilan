// src/screens/UserProfileScreen.tsx
import React from "react";
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
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, brand, radius, cardShadow } from "../theme";
import { likeCandidate } from "../api/discovery";

const { width } = Dimensions.get("window");

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const candidate = route.params?.candidate || {
    name: "Aastha Sharma",
    dateOfBirth: "1997-03-22",
    occupation: "Chartered Accountant",
    education: "MBA Finance",
    location: { city: "Kathmandu", country: "Nepal" },
    photos: [{ url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800" }],
    bio: "Namaste! Family-oriented, classical dancer, and Chartered Accountant. Looking for a respectful partner with traditional values.",
    rashi: "Tula (Libra)",
    gotra: "Kashyap",
    caste: "Brahmin",
    religion: "Hinduism",
    height: "5 ft 4 in",
    matchScore: 94,
    isVerified: true,
  };

  const handleConnect = async () => {
    try {
      await likeCandidate(candidate._id);
    } catch {}
    navigation.navigate("ChatDetail", {
      conversation: {
        _id: "conv-" + candidate._id,
        participants: [candidate],
      },
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Hero Photo */}
        <View style={styles.heroWrap}>
          <Image
            source={{
              uri:
                candidate.photos?.[0]?.url ||
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800",
            }}
            style={styles.heroImg}
          />
          <LinearGradient
            colors={["transparent", "rgba(15, 23, 42, 0.9)"]}
            style={styles.heroGradient}
          />

          {/* Back Button Floating */}
          <TouchableOpacity
            style={[styles.floatingBackBtn, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          {/* Name & Title */}
          <View style={styles.heroContent}>
            <View style={styles.matchScoreBadge}>
              <Ionicons name="sparkles" size={13} color="#f59e0b" />
              <Text style={styles.matchScoreText}>
                {candidate.matchScore || 92}% Match Score
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.nameText}>{candidate.name}</Text>
              {candidate.isVerified && (
                <Ionicons name="checkmark-circle" size={24} color="#38bdf8" />
              )}
            </View>
            <Text style={styles.subText}>
              {candidate.occupation} • {candidate.location?.city || "Kathmandu"}
            </Text>
          </View>
        </View>

        {/* Content Details */}
        <View style={styles.detailsContent}>
          {/* Bio */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>About Candidate</Text>
            <Text style={styles.bioText}>{candidate.bio}</Text>
          </View>

          {/* Horoscope & Cultural */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="moon-outline" size={18} color={brand.to} />
              <Text style={styles.cardTitle}>Horoscope &amp; Astrological Match</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Rashi (Zodiac)</Text>
                <Text style={styles.statVal}>{candidate.rashi || "Tula"}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Gotra</Text>
                <Text style={styles.statVal}>{candidate.gotra || "Kashyap"}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Caste</Text>
                <Text style={styles.statVal}>{candidate.caste || "Brahmin"}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Religion</Text>
                <Text style={styles.statVal}>{candidate.religion || "Hinduism"}</Text>
              </View>
            </View>
          </View>

          {/* Career & Education */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="briefcase-outline" size={18} color={brand.to} />
              <Text style={styles.cardTitle}>Education &amp; Profession</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Degree</Text>
                <Text style={styles.statVal}>{candidate.education || "Graduate"}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Profession</Text>
                <Text style={styles.statVal}>{candidate.occupation || "Employed"}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Height</Text>
                <Text style={styles.statVal}>{candidate.height || "5 ft 4 in"}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Marital Status</Text>
                <Text style={styles.statVal}>Never Married</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.chatActionBtn} onPress={handleConnect}>
          <LinearGradient
            colors={[brand.from, brand.to]}
            start={brand.start}
            end={brand.end}
            style={styles.chatActionGrad}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color="#ffffff" />
            <Text style={styles.chatActionText}>Connect &amp; Message</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  heroWrap: {
    width: "100%",
    height: 380,
    position: "relative",
  },
  heroImg: {
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingBackBtn: {
    position: "absolute",
    left: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  heroContent: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
  },
  matchScoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 5,
    marginBottom: 8,
  },
  matchScoreText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  nameText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
  },
  subText: {
    fontSize: 15,
    color: "#cbd5e1",
    marginTop: 2,
  },
  detailsContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
  },
  bioText: {
    fontSize: 14.5,
    color: colors.label,
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "48%",
    backgroundColor: colors.inputFill,
    padding: 10,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 11,
    color: colors.subtext,
    fontWeight: "600",
  },
  statVal: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.heading,
    marginTop: 2,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
  },
  chatActionBtn: {
    borderRadius: 16,
    overflow: "hidden",
  },
  chatActionGrad: {
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  chatActionText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 16,
  },
});
