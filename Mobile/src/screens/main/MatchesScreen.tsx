// src/screens/main/MatchesScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import { colors, radius, cardShadow } from "../../theme";
// SECURITY: canonical media gate (https + host allowlist, unsplash EXCLUDED) +
// shared ObjectId rule. See constants/mediaHosts.ts / utils/media.ts below.
import { isSafeMediaUrl, isObjectId } from "../../utils/media";
import {
  fetchMatches,
  fetchLikesReceived,
  MatchRecord,
  ReceivedLikeRecord,
} from "../../api/matches";
import { CandidateUser } from "../../api/discovery";

const DEFAULT_AVATAR = require("../../../assets/default-avatar.png");

const PRIMARY = "#E11D74";
const PRIMARY_DARK = "#BE185D";
const SOFT_PINK = "#FFF1F7";
const BORDER_PINK = "#FBCFE8";

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [likes, setLikes] = useState<CandidateUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"matches" | "likes">("matches");

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const [mData, lData] = await Promise.all([
        fetchMatches(),
        fetchLikesReceived(),
      ]);

      // Validate matches before updating state.
      const validMatches: MatchRecord[] = Array.isArray(mData?.matches)
        ? mData.matches.filter((item) => {
            return (
              typeof item?._id === "string" &&
              typeof item?.user?._id === "string" &&
              item.user._id.length > 0 &&
              typeof item.user.name === "string" &&
              item.user.name.trim().length > 0
            );
          })
        : [];

      // Extract and validate the users who liked the current user.
      const validLikes: CandidateUser[] = Array.isArray(lData?.likes)
        ? lData.likes
            .map((like: ReceivedLikeRecord) => like?.from)
            .filter((user): user is CandidateUser => {
              return (
                typeof user?._id === "string" &&
                user._id.length > 0 &&
                typeof user.name === "string" &&
                user.name.trim().length > 0
              );
            })
        : [];

      setMatches(validMatches);
      setLikes(validLikes);
    } catch (err: unknown) {
      console.error("Failed to load matches and likes:", err);

      setError(
        "Unable to load your connections. Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load data on screen mount.
  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRetry = () => {
    void loadData();
  };

  const handleRefresh = () => {
    void loadData(true);
  };

  const handleMatchPress = (item: MatchRecord) => {
    if (!item?.user?._id) {
      Alert.alert("Unable to open chat", "This match has invalid user data.");
      return;
    }

    // SECURITY/correctness: never forge a synthetic `conv-...` id. ChatDetail now
    // validates conversation._id as a real ObjectId before any API call, so a forged
    // id silently produces an unsendable phantom thread. Mutuals from /api/matches
    // carry a real conversationId (backend creates it on match) — same as the web.
    const cid = item.conversationId;
    const validCid = isObjectId(cid) ? cid : undefined;
    navigation.navigate("ChatDetail", {
      conversation: validCid
        ? { _id: validCid, participants: [item.user] }
        : { participants: [item.user] },
    });
  };

  const handleLikePress = (item: CandidateUser) => {
    if (typeof item?._id !== "string" || !item._id.trim()) {
      Alert.alert("Unable to open profile", "Invalid user data.");
      return;
    }

    // Validate MongoDB ObjectId format. (left exactly as your working version)
    if (!/^[a-fA-F0-9]{24}$/.test(item._id)) {
      Alert.alert(
        "Unable to open profile",
        "This profile has an invalid user ID."
      );
      return;
    }

    navigation.navigate("UserProfile", { userId: item._id });
  };

  const getPhotoUrl = (
    photos?: Array<{ url?: string | null }> | null
  ): { uri: string } | number => {
    const url = photos?.[0]?.url;

    // SECURITY: was accepting http:// + ANY https host. The knowledge base proves a
    // "photo URL" can resolve to an attacker host (images.unsplash.com -> BRZ7.GAMES
    // casino PWA). Gate through the canonical allowlist (https + owned/Giphy/Tenor
    // hosts; unsplash EXCLUDED); unsafe/empty -> bundled avatar. Signature unchanged.
    return isSafeMediaUrl(url) ? { uri: url as string } : DEFAULT_AVATAR;
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={
            activeTab === "matches" ? "heart-dislike-outline" : "people-outline"
          }
          size={54}
          color={PRIMARY}
        />
      </View>

      <Text style={styles.emptyTitle}>
        {activeTab === "matches" ? "No Matches Yet" : "No New Likes"}
      </Text>

      <Text style={styles.emptySubtitle}>
        {activeTab === "matches"
          ? "Keep discovering people to find your perfect match!"
          : "When someone likes you, they will appear here."}
      </Text>

      <TouchableOpacity
        style={styles.discoverBtn}
        onPress={() => navigation.navigate("Discover")}
        activeOpacity={0.8}
      >
        <Ionicons name="compass-outline" size={18} color="#FFFFFF" />
        <Text style={styles.discoverBtnText}>Discover People</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.loadingText}>Loading connections...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerBox}>
          <View style={styles.errorIconWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color="#DC2626" />
          </View>

          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>

          <TouchableOpacity
            style={styles.retryBtn}
            onPress={handleRetry}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={17} color="#FFFFFF" />
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="heart" size={23} color={PRIMARY} />
          </View>

          <Text style={styles.headerTitle}>Connections</Text>
        </View>

        <Text style={styles.headerSubtitle}>
          {matches.length} mutual matches {"\u2022"} {likes.length} interested
          in you
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === "matches" && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab("matches")}
          activeOpacity={0.75}
        >
          <Ionicons
            name="heart"
            size={17}
            color={activeTab === "matches" ? PRIMARY : colors.subtext}
          />

          <Text
            style={[
              styles.tabText,
              activeTab === "matches" && styles.tabTextActive,
            ]}
          >
            Matches ({matches.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === "likes" && styles.tabItemActive,
          ]}
          onPress={() => setActiveTab("likes")}
          activeOpacity={0.75}
        >
          <Ionicons
            name="heart-circle-outline"
            size={18}
            color={activeTab === "likes" ? PRIMARY : colors.subtext}
          />

          <Text
            style={[
              styles.tabText,
              activeTab === "likes" && styles.tabTextActive,
            ]}
          >
            Liked You ({likes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Matches */}
      {activeTab === "matches" ? (
        matches.length === 0 ? (
          renderEmptyState()
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={PRIMARY}
                colors={[PRIMARY]}
              />
            }
          >
            <Text style={styles.sectionHeading}>Your Matches</Text>

            {matches.map((item) => (
              <TouchableOpacity
                key={item._id}
                style={styles.matchRow}
                onPress={() => handleMatchPress(item)}
                activeOpacity={0.75}
              >
                <View style={styles.avatarContainer}>
                  <Image
                    source={getPhotoUrl(item.user.photos)}
                    style={styles.rowAvatar}
                  />
                  <View style={styles.avatarHeart}>
                    <Ionicons name="heart" size={11} color="#FFFFFF" />
                  </View>
                </View>

                <View style={styles.rowInfo}>
                  <View style={styles.rowHeader}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.user.name || "Unknown User"}
                    </Text>

                    <Text style={styles.rowTime}>
                      {item.matchedAt &&
                      !Number.isNaN(new Date(item.matchedAt).getTime())
                        ? new Date(item.matchedAt).toLocaleDateString()
                        : "Recently"}
                    </Text>
                  </View>

                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.user.occupation || "Professional"} {"\u2022"}{" "}
                    {item.user.location?.city || "Nepal"}
                  </Text>

                  <Text style={styles.rowMessage} numberOfLines={1}>
                    {item.lastMessage?.text || "Tap to start a conversation..."}
                  </Text>
                </View>

                <View style={styles.chatIconWrap}>
                  <Ionicons
                    name="chatbubble-ellipses"
                    size={19}
                    color={PRIMARY}
                  />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )
      ) : likes.length === 0 ? (
        renderEmptyState()
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={PRIMARY}
              colors={[PRIMARY]}
            />
          }
        >
          <Text style={styles.sectionHeading}>People Who Like You</Text>

          {likes.map((item) => (
            <TouchableOpacity
              key={item._id}
              style={styles.likeRow}
              onPress={() => handleLikePress(item)}
              activeOpacity={0.75}
            >
              <Image
                source={getPhotoUrl(item.photos)}
                style={styles.likeRowAvatar}
              />

              <View style={styles.likeRowInfo}>
                <View style={styles.likeRowHeader}>
                  <Text style={styles.likeRowName} numberOfLines={1}>
                    {item.name || "Unknown User"}
                  </Text>

                  {typeof item.matchScore === "number" &&
                    Number.isFinite(item.matchScore) && (
                      <View style={styles.matchScoreBadge}>
                        <Ionicons name="sparkles" size={11} color="#92400E" />
                        <Text style={styles.matchScoreBadgeText}>
                          {Math.round(item.matchScore)}%
                        </Text>
                      </View>
                    )}
                </View>

                <Text style={styles.likeRowSub} numberOfLines={1}>
                  {item.occupation || "Professional"} {"\u2022"}{" "}
                  {item.location?.city || "Nepal"}
                </Text>

                <Text style={styles.likeRowRashi} numberOfLines={1}>
                  {item.rashi || "Astro Match"}
                </Text>
              </View>

              <View style={styles.viewProfileBtn}>
                <Ionicons name="person-outline" size={15} color="#FFFFFF" />
                <Text style={styles.viewProfileBtnText}>View</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },

  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    color: colors.subtext,
    marginTop: 12,
    fontSize: 14,
  },

  errorIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.heading,
    marginTop: 16,
  },

  errorSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 21,
  },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    backgroundColor: PRIMARY,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.button,
  },

  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_PINK,
  },

  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: SOFT_PINK,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: colors.heading,
  },

  headerSubtitle: {
    fontSize: 13,
    color: colors.subtext,
    marginTop: 8,
  },

  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_PINK,
  },

  tabItem: {
    flex: 1,
    flexDirection: "row",
    gap: 7,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },

  tabItemActive: {
    borderBottomColor: PRIMARY,
  },

  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.subtext,
  },

  tabTextActive: {
    color: PRIMARY_DARK,
    fontWeight: "800",
  },

  content: {
    padding: 16,
    paddingBottom: 32,
  },

  sectionHeading: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.heading,
    marginTop: 8,
    marginBottom: 14,
  },

  // Match Row
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: radius.card,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: BORDER_PINK,
    ...cardShadow,
  },

  avatarContainer: {
    position: "relative",
  },

  rowAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SOFT_PINK,
  },

  avatarHeart: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PRIMARY,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },

  rowInfo: {
    flex: 1,
    minWidth: 0,
  },

  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },

  rowName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.heading,
    flex: 1,
  },

  rowTime: {
    fontSize: 10,
    color: colors.subtext,
  },

  rowSub: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 4,
  },

  rowMessage: {
    fontSize: 12,
    color: colors.label,
    marginTop: 5,
  },

  chatIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SOFT_PINK,
    alignItems: "center",
    justifyContent: "center",
  },

  // Likes Row
  likeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: radius.card,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER_PINK,
    ...cardShadow,
  },

  likeRowAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: SOFT_PINK,
  },

  likeRowInfo: {
    flex: 1,
    minWidth: 0,
  },

  likeRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 5,
  },

  likeRowName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "800",
    color: colors.heading,
  },

  matchScoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 3,
  },

  matchScoreBadgeText: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "800",
  },

  likeRowSub: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 4,
  },

  likeRowRashi: {
    fontSize: 12,
    color: PRIMARY_DARK,
    fontWeight: "700",
    marginTop: 4,
  },

  viewProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: PRIMARY,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: radius.chip,
  },

  viewProfileBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },

  emptyIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: SOFT_PINK,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: BORDER_PINK,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.heading,
    marginTop: 20,
    textAlign: "center",
  },

  emptySubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },

  discoverBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    backgroundColor: PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: radius.button,
  },

  discoverBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
});
