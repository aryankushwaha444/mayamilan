// src/screens/DiscoverScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius, cardShadow } from "../theme";
import {
  getDiscoveryCandidates,
  likeCandidate,
  unlikeCandidate,
  CandidateUser,
  DiscoveryQuery,
} from "../api/discovery";

const { width } = Dimensions.get("window");

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
        if (firstUser.isMatched) {
          setCurrentLikeState("unmatched");
        } else if (firstUser.isLiked) {
          setCurrentLikeState("liked");
        } else {
          setCurrentLikeState("none");
        }
      } else {
        setCurrentLikeState("none");
      }
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
      if (nextUser.isMatched) {
        setCurrentLikeState("unmatched");
      } else if (nextUser.isLiked) {
        setCurrentLikeState("liked");
      } else {
        setCurrentLikeState("none");
      }
    } else {
      setCurrentIndex(candidates.length);
    }
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
        // User clicked BROKEN heart → unlike → becomes FILLED heart
        setCurrentLikeState("none");
        await unlikeCandidate(current._id);
      } else {
        // User clicked FILLED heart → like → becomes BROKEN heart
        setCurrentLikeState("liked");
        const res = await likeCandidate(current._id);
        if (res?.matched) {
          setMatchAlert(current);
        }
      }
    } catch (error: any) {
      // Revert if database fails
      setCurrentLikeState(previousState);
      console.error("❌ Failed to toggle like:", error);
      Alert.alert("Update Failed", "Could not update database.");
    } finally {
      setIsProcessingLike(false);
    }
  };

  // ✅ Navigate to UserProfileScreen instead of showing a modal
  const onViewProfile = () => {
    if (current) {
      navigation.navigate("UserProfile", { userId: current._id });
    }
  };

  const getLikeButtonConfig = () => {
    switch (currentLikeState) {
      case "liked":
        return {
          icon: "heart-dislike", // ✅ BROKEN HEART when liked
          color: "#ef4444", // Red
          size: 28,
        };
      case "unmatched":
        return {
          icon: "heart", // ✅ FILLED HEART when unmatched
          color: brand.from, // Brand color
          size: 28,
        };
      default: // "none" (not liked yet)
        return {
          icon: "heart", // ✅ FILLED HEART when not liked yet
          color: brand.from, // Brand color
          size: 28,
        };
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
      {/* Header */}
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

      {/* Filter drawer */}
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

      {/* Main Card View */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          {/* Candidate Image */}
          <View style={styles.imageWrapper}>
            <Image
              source={{
                uri:
                  current.photos?.[photoIndex]?.url || current.photos?.[0]?.url,
              }}
              style={styles.cardImage}
              resizeMode="cover"
            />

            {/* Photo Indicator dots */}
            {current.photos && current.photos.length > 1 && (
              <View style={styles.photoIndicators}>
                {current.photos.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.photoDot,
                      i === photoIndex && styles.photoDotActive,
                    ]}
                  />
                ))}
              </View>
            )}

            {/* Tap Left / Right for photo */}
            {current.photos && current.photos.length > 1 && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
                pointerEvents="box-none"
              >
                <TouchableOpacity
                  style={styles.tapLeft}
                  onPress={() =>
                    setPhotoIndex((prev) =>
                      prev > 0 ? prev - 1 : current.photos!.length - 1
                    )
                  }
                />
                <TouchableOpacity
                  style={styles.tapRight}
                  onPress={() =>
                    setPhotoIndex((prev) =>
                      prev < current.photos!.length - 1 ? prev + 1 : 0
                    )
                  }
                />
              </View>
            )}

            {/* Match Score Badge */}
            {current.matchScore && (
              <View style={styles.matchBadge}>
                <Ionicons name="sparkles" size={12} color={brand.from} />
                <Text style={styles.matchBadgeText}>
                  {current.matchScore}% Match
                </Text>
              </View>
            )}

            {/* Gradient overlay */}
            <LinearGradient
              colors={["transparent", "rgba(15, 23, 42, 0.95)"]}
              style={styles.imageGradient}
            />

            {/* Candidate Info Overlay */}
            <View style={styles.infoOverlay}>
              <View style={styles.nameRow}>
                <Text style={styles.candidateName}>{current.name}</Text>
                {current.isVerified && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color="#10b981"
                    style={{ marginLeft: 6 }}
                  />
                )}
              </View>

              <View style={styles.locationRow}>
                <Ionicons
                  name="location-sharp"
                  size={14}
                  color={colors.white}
                />
                <Text style={styles.locationText}>
                  {current.location?.city || "Nepal"}
                </Text>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.occupationText} numberOfLines={1}>
                  {current.occupation || "Professional"}
                </Text>
              </View>

              {/* Matrimonial Tags */}
              <View style={styles.tagStrip}>
                {current.caste && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{current.caste}</Text>
                  </View>
                )}
                {current.rashi && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: "rgba(236,72,153,0.15)" },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: "#f472b6" }]}>
                      {current.rashi}
                    </Text>
                  </View>
                )}
                {current.gotra && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: "rgba(245,158,11,0.15)" },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: "#fbbf24" }]}>
                      {current.gotra}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* ✅ View Full Biodata Bar (Navigates to UserProfile) */}
          <TouchableOpacity
            style={styles.biodataBar}
            onPress={onViewProfile}
            activeOpacity={0.8}
          >
            <Ionicons
              name="document-text-outline"
              size={15}
              color={colors.iconTint}
            />
            <Text style={styles.biodataBarText}>
              View Full Matrimonial Biodata
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.subtext} />
          </TouchableOpacity>

          {/* Actions Bar */}
          <View style={styles.actionsBar}>
            {/* PASS Button */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.passBtn]}
              onPress={onPass}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={26} color={colors.danger} />
            </TouchableOpacity>

            {/* ✅ VIEW PROFILE Button (Navigates to UserProfile) */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.profileBtn]}
              onPress={onViewProfile}
              activeOpacity={0.8}
            >
              <Ionicons name="person" size={24} color={colors.link} />
            </TouchableOpacity>

            {/* ✅ LIKE Button - TOGGLEABLE */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  width: 56,
                  height: 56,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor:
                    currentLikeState === "liked"
                      ? "#ef4444" // Red border for broken heart
                      : brand.from, // Brand color border for filled heart
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  ...cardShadow,
                  opacity: isProcessingLike ? 0.6 : 1,
                },
              ]}
              onPress={onLike}
              activeOpacity={0.8}
              disabled={isProcessingLike}
            >
              {isProcessingLike ? (
                <ActivityIndicator size="small" color={colors.subtext} />
              ) : (
                <Ionicons
                  name={likeConfig.icon as any}
                  size={likeConfig.size}
                  color={likeConfig.color}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Match Celebration Alert */}
      {matchAlert && (
        <Modal
          visible={!!matchAlert}
          animationType="fade"
          transparent
          onRequestClose={() => setMatchAlert(null)}
        >
          <View style={styles.celebrationBackdrop}>
            <View style={styles.celebrationCard}>
              <View style={styles.celebrationIconBox}>
                <Ionicons name="heart" size={36} color={colors.white} />
              </View>

              <Text style={styles.celebrationTitle}>It's a Match!</Text>
              <Text style={styles.celebrationSub}>
                You and {matchAlert.name} have expressed mutual matrimonial
                interest.
              </Text>

              <TouchableOpacity
                style={styles.celebrationActionBtn}
                onPress={() => {
                  setMatchAlert(null);
                  navigation.navigate("Messages");
                }}
              >
                <Ionicons
                  name="chatbubble-ellipses"
                  size={16}
                  color={colors.white}
                />
                <Text style={styles.celebrationActionText}>
                  Send First Message
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.celebrationDismissBtn}
                onPress={() => setMatchAlert(null)}
              >
                <Text style={styles.celebrationDismissText}>Keep Browsing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

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
  cardContainer: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    height: "100%",
    maxHeight: 560,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    ...cardShadow,
  },
  imageWrapper: {
    flex: 1,
    position: "relative",
    backgroundColor: colors.inputFill,
  },
  cardImage: { width: "100%", height: "100%" },
  photoIndicators: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    gap: 4,
    zIndex: 10,
  },
  photoDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  photoDotActive: { backgroundColor: colors.white },
  tapLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: "50%" },
  tapRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: "50%" },
  matchBadge: {
    position: "absolute",
    top: 16,
    right: 12,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.chip,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    zIndex: 10,
  },
  matchBadgeText: { color: brand.from, fontSize: 11, fontWeight: "800" },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  infoOverlay: { position: "absolute", bottom: 12, left: 14, right: 14 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  candidateName: { fontSize: 22, fontWeight: "900", color: colors.white },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  locationText: { fontSize: 12, color: colors.white, marginLeft: 4 },
  bullet: { color: "rgba(255,255,255,0.6)", marginHorizontal: 6 },
  occupationText: { fontSize: 12, color: colors.white, flex: 1 },
  tagStrip: { flexDirection: "row", gap: 6, marginTop: 8 },
  badge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.chip,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "700" },
  biodataBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.inputBorder,
  },
  biodataBarText: { fontSize: 12, fontWeight: "700", color: colors.heading },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
  },
  actionBtn: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  passBtn: {
    width: 48,
    height: 48,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  profileBtn: {
    width: 48,
    height: 48,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.link,
  },
  likeBtn: {
    width: 56,
    height: 56,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
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
  celebrationBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  celebrationCard: {
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
  celebrationIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: brand.from,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  celebrationTitle: { fontSize: 22, fontWeight: "900", color: colors.heading },
  celebrationSub: {
    fontSize: 13,
    color: colors.subtext,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  celebrationActionBtn: {
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
  celebrationActionText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 13,
  },
  celebrationDismissBtn: { marginTop: 10, paddingVertical: 8 },
  celebrationDismissText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "600",
  },
});
