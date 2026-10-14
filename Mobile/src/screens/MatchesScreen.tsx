// src/screens/MatchesScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../theme";
import { fetchMatches, fetchLikesReceived, MatchRecord } from "../api/matches";
import { CandidateUser } from "../api/discovery";

const SAMPLE_MATCHES: MatchRecord[] = [
  {
    _id: "match-1",
    user: {
      _id: "u-1",
      name: "Pooja Acharya",
      gender: "female",
      occupation: "Architect",
      location: { city: "Kathmandu" },
      photos: [
        { url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500", isPrimary: true },
      ],
      rashi: "Kanya (Virgo)",
      matchScore: 96,
    },
    matchedAt: "2 hours ago",
    lastMessage: "Namaste! Glad we matched here.",
    conversationId: "conv-1",
  },
  {
    _id: "match-2",
    user: {
      _id: "u-2",
      name: "Bibek Karki",
      gender: "male",
      occupation: "Civil Engineer",
      location: { city: "Pokhara" },
      photos: [
        { url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500", isPrimary: true },
      ],
      rashi: "Dhanu (Sagittarius)",
      matchScore: 91,
    },
    matchedAt: "Yesterday",
    lastMessage: "Would love to discuss families and career goals.",
    conversationId: "conv-2",
  },
];

const SAMPLE_LIKES: CandidateUser[] = [
  {
    _id: "like-1",
    name: "Sushmita Rai",
    gender: "female",
    occupation: "Banking Executive",
    location: { city: "Dharan" },
    photos: [
      { url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500", isPrimary: true },
    ],
    rashi: "Makar (Capricorn)",
    matchScore: 88,
  },
  {
    _id: "like-2",
    name: "Anjali KC",
    gender: "female",
    occupation: "Fashion Designer",
    location: { city: "Butwal" },
    photos: [
      { url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500", isPrimary: true },
    ],
    rashi: "Meen (Pisces)",
    matchScore: 85,
  },
];

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [likes, setLikes] = useState<CandidateUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"matches" | "likes">("matches");

  useEffect(() => {
    async function loadData() {
      try {
        const m = await fetchMatches();
        const l = await fetchLikesReceived();
        setMatches(m?.matches?.length ? m.matches : SAMPLE_MATCHES);
        setLikes(l?.likes?.length ? l.likes : SAMPLE_LIKES);
      } catch {
        setMatches(SAMPLE_MATCHES);
        setLikes(SAMPLE_LIKES);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Matches &amp; Connections</Text>
        <Text style={styles.headerSubtitle}>
          {matches.length} mutual connections • {likes.length} members interested in you
        </Text>
      </View>

      {/* Segmented Controls */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "matches" && styles.tabItemActive]}
          onPress={() => setActiveTab("matches")}
        >
          <Text
            style={[styles.tabText, activeTab === "matches" && styles.tabTextActive]}
          >
            Mutual Matches ({matches.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === "likes" && styles.tabItemActive]}
          onPress={() => setActiveTab("likes")}
        >
          <Text
            style={[styles.tabText, activeTab === "likes" && styles.tabTextActive]}
          >
            Liked You ({likes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={brand.to} />
        </View>
      ) : activeTab === "matches" ? (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Recent Match Circles Reel */}
          <Text style={styles.sectionHeading}>New Matches</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.reelScroll}
          >
            {matches.map((item) => (
              <TouchableOpacity
                key={item._id}
                style={styles.reelItem}
                onPress={() =>
                  navigation.navigate("ChatDetail", {
                    conversation: {
                      _id: item.conversationId || "conv-" + item._id,
                      participants: [item.user],
                    },
                  })
                }
              >
                <View style={styles.avatarBorder}>
                  <Image
                    source={{ uri: item.user.photos?.[0]?.url }}
                    style={styles.reelAvatar}
                  />
                  <View style={styles.matchScorePill}>
                    <Text style={styles.matchScorePillText}>
                      {item.user.matchScore}%
                    </Text>
                  </View>
                </View>
                <Text style={styles.reelName} numberOfLines={1}>
                  {item.user.name.split(" ")[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Conversations List with Matrimonial Details */}
          <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
            Conversations
          </Text>
          {matches.map((item) => (
            <TouchableOpacity
              key={item._id}
              style={styles.matchRow}
              onPress={() =>
                navigation.navigate("ChatDetail", {
                  conversation: {
                    _id: item.conversationId || "conv-" + item._id,
                    participants: [item.user],
                  },
                })
              }
            >
              <Image
                source={{ uri: item.user.photos?.[0]?.url }}
                style={styles.rowAvatar}
              />
              <View style={styles.rowInfo}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowName}>{item.user.name}</Text>
                  <Text style={styles.rowTime}>{item.matchedAt}</Text>
                </View>
                <Text style={styles.rowSub}>
                  {item.user.occupation} • {item.user.location?.city}
                </Text>
                <Text style={styles.rowMessage} numberOfLines={1}>
                  {item.lastMessage || "Tap to start conversation..."}
                </Text>
              </View>

              <Ionicons name="chatbubble-outline" size={20} color={brand.to} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        /* Likes You Grid */
        <FlatList
          data={likes}
          keyExtractor={(item) => item._id}
          numColumns={2}
          contentContainerStyle={styles.likesGrid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.likeCard}
              onPress={() => navigation.navigate("UserProfile", { candidate: item })}
            >
              <Image
                source={{ uri: item.photos?.[0]?.url }}
                style={styles.likeCardImage}
              />
              <View style={styles.likeCardOverlay}>
                <Text style={styles.likeCardName}>{item.name}</Text>
                <Text style={styles.likeCardSub}>
                  {item.occupation} • {item.rashi || "Astro Match"}
                </Text>
                <View style={styles.likeCardAction}>
                  <Ionicons name="heart" size={14} color="#ec4899" />
                  <Text style={styles.likeCardActionText}>Match Back</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.heading,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.subtext,
    marginTop: 2,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: {
    borderBottomColor: brand.to,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.subtext,
  },
  tabTextActive: {
    color: brand.to,
    fontWeight: "700",
  },
  content: {
    padding: 16,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.heading,
    marginBottom: 12,
  },
  reelScroll: {
    gap: 14,
    paddingRight: 20,
  },
  reelItem: {
    alignItems: "center",
    width: 74,
  },
  avatarBorder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 2,
    borderWidth: 2,
    borderColor: brand.from,
    position: "relative",
  },
  reelAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
  },
  matchScorePill: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: brand.to,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  matchScorePillText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "800",
  },
  reelName: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: colors.heading,
    textAlign: "center",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    gap: 12,
  },
  rowAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  rowInfo: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.heading,
  },
  rowTime: {
    fontSize: 11,
    color: colors.subtext,
  },
  rowSub: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 1,
  },
  rowMessage: {
    fontSize: 13,
    color: colors.heading,
    marginTop: 4,
  },
  likesGrid: {
    padding: 12,
    gap: 12,
  },
  likeCard: {
    flex: 1,
    margin: 6,
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#1e293b",
  },
  likeCardImage: {
    width: "100%",
    height: "100%",
  },
  likeCardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
  },
  likeCardName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  likeCardSub: {
    fontSize: 11,
    color: "#cbd5e1",
    marginTop: 2,
  },
  likeCardAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  likeCardActionText: {
    color: "#f472b6",
    fontSize: 11,
    fontWeight: "700",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
