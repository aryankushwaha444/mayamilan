// src/screens/main/DiscoverScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native"; // Image / Modal / Dimensions removed (now unused at screen level)
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../../theme"; // cardShadow removed (moved into the components)
import {
  getDiscoveryCandidates,
  likeCandidate,
  unlikeCandidate,
  CandidateUser,
  DiscoveryQuery,
} from "../../api/discovery";
import { ProfileCard, MatchCard } from "../../components/discovery";

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [matchAlert, setMatchAlert] = useState<CandidateUser | null>(null);
  const [isProcessingLike, setIsProcessingLike] = useState(false);
  const [currentLikeState, setCurrentLikeState] = useState<
    "none" | "liked" | "unmatched"
  >("none");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [minAge, setMinAge] = useState<string>("20");
  const [maxAge, setMaxAge] = useState<string>("35");

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams: DiscoveryQuery = { page: 1, limit: 10 };
      if (minAge) queryParams.minAge = Number(minAge);
      if (maxAge) queryParams.maxAge = Number(maxAge);
      if (genderFilter !== "all") queryParams.gender = genderFilter;
      if (cityFilter.trim()) queryParams.city = cityFilter.trim();
      const data = await getDiscoveryCandidates(queryParams);
      const users = data?.users || data || [];
      setCandidates(users);
      if (users.length > 0) {
        const firstUser = users[0];
        if (firstUser.isMatched) setCurrentLikeState("unmatched");
        else if (firstUser.isLiked) setCurrentLikeState("liked");
        else setCurrentLikeState("none");
      } else setCurrentLikeState("none");
    } catch (error) {
      console.error("Failed to fetch discovery candidates:", error);
      setCandidates([]);
    } finally {
      setLoading(false);
      setCurrentIndex(0);
      setPhotoIndex(0);
    }
  }, [genderFilter, cityFilter, minAge, maxAge]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const current = candidates[currentIndex];

  const handleNext = () => {
    setPhotoIndex(0);
    if (currentIndex < candidates.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      const nextUser = candidates[nextIndex];
      if (nextUser.isMatched) setCurrentLikeState("unmatched");
      else if (nextUser.isLiked) setCurrentLikeState("liked");
      else setCurrentLikeState("none");
    } else setCurrentIndex(candidates.length);
  };

  const onPass = () => {
    if (!current) return;
    handleNext();
  };

  const onLike = async () => {
    if (!current || isProcessingLike) return;
    setIsProcessingLike(true);
    const previousState = currentLikeState;
    try {
      if (currentLikeState === "liked") {
        setCurrentLikeState("none");
        await unlikeCandidate(current._id);
      } else {
        setCurrentLikeState("liked");
        const res = await likeCandidate(current._id);
        if (res?.matched) setMatchAlert(current);
      }
    } catch (error: any) {
      setCurrentLikeState(previousState);
      console.error("❌ Failed to toggle like:", error);
      Alert.alert("Update Failed", "Could not update database.");
    } finally {
      setIsProcessingLike(false);
    }
  };

  const onViewProfile = () => {
    if (current) navigation.navigate("UserProfile", { userId: current._id });
  };

  // photo carousel handlers — identical wrap logic to the inline arrows, now named + passed down
  const prevPhoto = () =>
    setPhotoIndex((p) => (p > 0 ? p - 1 : (current?.photos?.length ?? 1) - 1));
  const nextPhoto = () =>
    setPhotoIndex((p) => (p < (current?.photos?.length ?? 1) - 1 ? p + 1 : 0));

  const getLikeButtonConfig = () => {
    switch (currentLikeState) {
      case "liked":
        return { icon: "heart-dislike", color: "#ef4444", size: 28 };
      case "unmatched":
        return { icon: "heart", color: brand.from, size: 28 };
      default:
        return { icon: "heart", color: brand.from, size: 28 };
    }
  };
  const likeConfig = getLikeButtonConfig();

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.iconTint} />
          <Text style={styles.loadingText}>
            Loading matrimonial candidates...
          </Text>
        </View>
      </View>
    );
  }

  if (!current || candidates.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerContainer}>
          <Ionicons name="sparkles-outline" size={48} color={colors.subtext} />
          <Text style={styles.noMoreTitle}>No More Profiles</Text>
          <Text style={styles.noMoreSub}>
            You've explored all matrimonial candidates matching your current
            filters.
          </Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              setCurrentIndex(0);
              fetchProfiles();
            }}
          >
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.refreshBtnText}>Reset & Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <LinearGradient
            colors={[brand.from, brand.to]}
            start={brand.start}
            end={brand.end}
            style={styles.headerLogoBadge}
          >
            <Ionicons name="heart" size={18} color={colors.white} />
          </LinearGradient>
          <View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={styles.headerTitle}>Maya Milan</Text>
              <View style={styles.verifiedTag}>
                <Text style={styles.verifiedTagText}>Verified</Text>
              </View>
            </View>
            <Text style={styles.headerSub}>Nepali Matrimonial</Text>
          </View>
        </View>
        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.chatHeaderBtn}
            onPress={() => navigation.navigate("Messages")}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubbles" size={19} color={colors.iconTint} />
            <View style={styles.chatBadgeDot}>
              <Text style={styles.chatBadgeText}>2</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
            onPress={() => setShowFilters(!showFilters)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="options-outline"
              size={19}
              color={showFilters ? colors.white : colors.subtext}
            />
          </TouchableOpacity>
        </View>
      </View>

      {showFilters && (
        <View style={styles.filterDrawer}>
          <View style={styles.filterRow}>
            <View style={styles.filterCol}>
              <Text style={styles.filterLabel}>Gender</Text>
              <View style={styles.chipRow}>
                {["all", "female", "male"].map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setGenderFilter(g)}
                    style={[
                      styles.chip,
                      genderFilter === g && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        genderFilter === g && styles.chipTextActive,
                      ]}
                    >
                      {g === "all"
                        ? "All"
                        : g === "female"
                        ? "Brides"
                        : "Grooms"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.filterRow}>
            <View style={styles.filterCol}>
              <Text style={styles.filterLabel}>City / Location</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Kathmandu, Pokhara..."
                placeholderTextColor={colors.placeholder}
                value={cityFilter}
                onChangeText={setCityFilter}
              />
            </View>
          </View>
          <TouchableOpacity
            style={styles.applyFilterBtn}
            onPress={() => {
              setShowFilters(false);
              fetchProfiles();
            }}
          >
            <Text style={styles.applyFilterText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* was the inline imageWrapper/biodata/actions block -> now the gated component */}
      <ProfileCard
        user={current}
        photoIndex={photoIndex}
        onPhotoPrev={prevPhoto}
        onPhotoNext={nextPhoto}
        onViewProfile={onViewProfile}
        onPass={onPass}
        onLike={onLike}
        likeIcon={likeConfig.icon}
        likeColor={likeConfig.color}
        likeSize={likeConfig.size}
        isProcessingLike={isProcessingLike}
      />

      {/* was the inline celebration Modal -> now the component */}
      <MatchCard
        user={matchAlert}
        onClose={() => setMatchAlert(null)}
        onSendMessage={() => {
          setMatchAlert(null);
          navigation.navigate("Messages");
        }}
      />
    </View>
  );
}

// screen-level styles only (card*/celebration* moved into the components verbatim)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.heading,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 10,
    color: colors.subtext,
    marginTop: 1,
    fontWeight: "500",
  },
  headerBrandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.icon,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedTag: {
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.3)",
  },
  verifiedTagText: { fontSize: 9, fontWeight: "700", color: colors.iconTint },
  headerRightActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  chatBadgeDot: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: brand.from,
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  chatBadgeText: { color: colors.white, fontSize: 8, fontWeight: "900" },
  filterBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    backgroundColor: colors.iconTint,
    borderColor: colors.iconTint,
  },
  filterDrawer: {
    backgroundColor: colors.card,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  filterRow: { marginBottom: 10 },
  filterCol: {},
  filterLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.subtext,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.chip,
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  chipActive: {
    backgroundColor: colors.iconTint,
    borderColor: colors.iconTint,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.subtext },
  chipTextActive: { color: colors.white },
  input: {
    backgroundColor: colors.inputFill,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.field,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.heading,
    fontSize: 13,
  },
  applyFilterBtn: {
    backgroundColor: brand.from,
    borderRadius: radius.button,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  applyFilterText: { color: colors.white, fontWeight: "700", fontSize: 13 },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: colors.subtext, fontSize: 13, marginTop: 12 },
  noMoreTitle: {
    color: colors.heading,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  noMoreSub: {
    color: colors.subtext,
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    backgroundColor: brand.from,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.button,
  },
  refreshBtnText: { color: colors.white, fontSize: 13, fontWeight: "700" },
});
