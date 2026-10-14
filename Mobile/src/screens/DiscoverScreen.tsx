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
  ScrollView,
  Modal,
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
  superLikeCandidate,
  CandidateUser,
  DiscoveryQuery,
} from "../api/discovery";

const { width } = Dimensions.get("window");

const SAMPLE_FALLBACK_CANDIDATES: CandidateUser[] = [
  {
    _id: "cand-1",
    name: "Aastha Sharma",
    gender: "female",
    dateOfBirth: "1997-04-12T00:00:00.000Z",
    bio: "Namaste! Family-oriented, classical Bharatnatyam dancer, and Chartered Accountant. Value traditional Hindu culture with an open, modern outlook. Seeking a well-educated partner with mutual respect.",
    occupation: "Chartered Accountant",
    education: "MBA Finance (Tribhuvan University)",
    relationshipGoal: "marriage",
    photos: [
      {
        url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
        isPrimary: true,
      },
      {
        url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80",
        isPrimary: false,
      },
    ],
    location: {
      city: "Kathmandu",
      state: "Bagmati",
      country: "Nepal",
    },
    caste: "Brahmin",
    gotra: "Kashyap",
    rashi: "Tula (Libra)",
    religion: "Hinduism",
    height: "5 ft 4 in",
    diet: "Vegetarian",
    maritalStatus: "Never Married",
    familyType: "Nuclear Family in New Baneshwor, Kathmandu",
    matchScore: 96,
    isVerified: true,
  },
  {
    _id: "cand-2",
    name: "Prabesh Shrestha",
    gender: "male",
    dateOfBirth: "1995-08-20T00:00:00.000Z",
    bio: "Tech enthusiast, entrepreneur, and weekend hiker in the Annapurnas. Passionate about innovation, traditional Newari cuisine, and building things that matter. Looking for a smart, compassionate companion.",
    occupation: "Lead Software Architect",
    education: "B.E. Computer Engineering (Pulchowk Campus)",
    relationshipGoal: "marriage",
    photos: [
      {
        url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&auto=format&fit=crop&q=80",
        isPrimary: true,
      },
      {
        url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=80",
        isPrimary: false,
      },
    ],
    location: {
      city: "Lalitpur",
      state: "Bagmati",
      country: "Nepal",
    },
    caste: "Newar",
    gotra: "Manav",
    rashi: "Simha (Leo)",
    religion: "Buddhism / Hinduism",
    height: "5 ft 10 in",
    diet: "Non-Vegetarian",
    maritalStatus: "Never Married",
    familyType: "Respected business family in Patan, Lalitpur",
    matchScore: 92,
    isVerified: true,
  },
  {
    _id: "cand-3",
    name: "Dr. Kriti Adhikari",
    gender: "female",
    dateOfBirth: "1998-11-05T00:00:00.000Z",
    bio: "Resident Medical Doctor at Manipal Hospital. When not in scrubs, I love playing acoustic guitar, swimming by Phewa Lake, and reading medical thrillers. Seeking understanding and emotional warmth.",
    occupation: "Resident Medical Doctor (MD)",
    education: "MBBS (KMC), MD Resident (Manipal Pokhara)",
    relationshipGoal: "marriage",
    photos: [
      {
        url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80",
        isPrimary: true,
      },
      {
        url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80",
        isPrimary: false,
      },
    ],
    location: {
      city: "Pokhara",
      state: "Gandaki",
      country: "Nepal",
    },
    caste: "Brahmin",
    gotra: "Vashishta",
    rashi: "Vrischika (Scorpio)",
    religion: "Hinduism",
    height: "5 ft 5 in",
    diet: "Vegetarian",
    maritalStatus: "Never Married",
    familyType: "Educated family in Lakeside, Pokhara",
    matchScore: 94,
    isVerified: true,
  },
  {
    _id: "cand-4",
    name: "Suman Gurung",
    gender: "male",
    dateOfBirth: "1996-03-25T00:00:00.000Z",
    bio: "Aviation Pilot for domestic & mountain flights. Passionate about mountains, paragliding, fitness, and family gatherings. Looking for a confident, joyful life partner who loves adventure.",
    occupation: "Commercial Airline Pilot",
    education: "Commercial Pilot License (CAAN / New Zealand)",
    relationshipGoal: "marriage",
    photos: [
      {
        url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&auto=format&fit=crop&q=80",
        isPrimary: true,
      },
    ],
    location: {
      city: "Pokhara",
      state: "Gandaki",
      country: "Nepal",
    },
    caste: "Gurung",
    gotra: "Ghale",
    rashi: "Mesh (Aries)",
    religion: "Buddhism",
    height: "5 ft 11 in",
    diet: "Non-Vegetarian",
    maritalStatus: "Never Married",
    familyType: "Traditional Gurung family in Pokhara",
    matchScore: 90,
    isVerified: true,
  },
  {
    _id: "cand-5",
    name: "Pooja Kushwaha",
    gender: "female",
    dateOfBirth: "1999-07-18T00:00:00.000Z",
    bio: "Senior UI/UX Product Designer currently working remotely. Love vibrant Mithila folk art, indie podcasts, and peaceful evenings. Seeking an understanding partner who values family and ambition equally.",
    occupation: "Senior UI/UX Designer",
    education: "B.Sc. CSIT (Kathmandu University)",
    relationshipGoal: "marriage",
    photos: [
      {
        url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80",
        isPrimary: true,
      },
      {
        url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=80",
        isPrimary: false,
      },
    ],
    location: {
      city: "Janakpur",
      state: "Madhesh",
      country: "Nepal",
    },
    caste: "Kushwaha",
    gotra: "Kashyap",
    rashi: "Kanya (Virgo)",
    religion: "Hinduism",
    height: "5 ft 3 in",
    diet: "Vegetarian",
    maritalStatus: "Never Married",
    familyType: "Close-knit family in Janakpurdham",
    matchScore: 97,
    isVerified: true,
  },
  {
    _id: "cand-6",
    name: "Bikash Yadav",
    gender: "male",
    dateOfBirth: "1994-09-12T00:00:00.000Z",
    bio: "Civil Engineer & Infrastructure Consultant. Passionate about green energy, cricket, and community development. Looking for an educated, grounded partner with shared cultural values.",
    occupation: "Senior Civil Engineer",
    education: "M.Tech Structural Engineering (IOE Thapathali)",
    relationshipGoal: "marriage",
    photos: [
      {
        url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80",
        isPrimary: true,
      },
    ],
    location: {
      city: "Biratnagar",
      state: "Koshi",
      country: "Nepal",
    },
    caste: "Yadav",
    gotra: "Sandilya",
    rashi: "Dhanu (Sagittarius)",
    religion: "Hinduism",
    height: "5 ft 10 in",
    diet: "Vegetarian",
    maritalStatus: "Never Married",
    familyType: "Nuclear family in Main Road, Biratnagar",
    matchScore: 91,
    isVerified: true,
  },
];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [candidates, setCandidates] = useState<CandidateUser[]>(SAMPLE_FALLBACK_CANDIDATES);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [matchAlert, setMatchAlert] = useState<CandidateUser | null>(null);
  const [detailCandidate, setDetailCandidate] = useState<CandidateUser | null>(null);

  // Filters
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [minAge, setMinAge] = useState<string>("20");
  const [maxAge, setMaxAge] = useState<string>("35");

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams: DiscoveryQuery = {};
      if (minAge) queryParams.minAge = minAge;
      if (maxAge) queryParams.maxAge = maxAge;
      if (genderFilter !== "all") queryParams.gender = genderFilter;
      if (cityFilter.trim()) queryParams.city = cityFilter.trim();

      const data = await getDiscoveryCandidates(queryParams);
      if (data && data.users && data.users.length > 0) {
        setCandidates(data.users);
      } else {
        setCandidates(SAMPLE_FALLBACK_CANDIDATES);
      }
    } catch {
      setCandidates(SAMPLE_FALLBACK_CANDIDATES);
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
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(candidates.length);
    }
  };

  const onPass = async () => {
    if (!current) return;
    try {
      await unlikeCandidate(current._id);
    } catch {
      // ignore
    }
    handleNext();
  };

  const onLike = async () => {
    if (!current) return;
    try {
      const res = await likeCandidate(current._id);
      if (res?.matched || (current.matchScore && current.matchScore >= 92)) {
        setMatchAlert(current);
      }
    } catch {
      if (current.matchScore && current.matchScore >= 92) {
        setMatchAlert(current);
      }
    }
    handleNext();
  };

  const onSuperLike = async () => {
    if (!current) return;
    try {
      await superLikeCandidate(current._id);
      setMatchAlert(current);
    } catch {
      setMatchAlert(current);
    }
    handleNext();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with App Name (Maya Milan), App Icon, and Top-Right Chat Button */}
      <View style={styles.header}>
        <View style={styles.headerBrandRow}>
          <LinearGradient
            colors={[brand.from, brand.to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerLogoBadge}
          >
            <Ionicons name="heart" size={18} color="#ffffff" />
          </LinearGradient>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
            <Ionicons name="chatbubbles" size={19} color={brand.to} />
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
              color={showFilters ? colors.white : colors.slate300}
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
                      {g === "all" ? "All" : g === "female" ? "Brides" : "Grooms"}
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
                placeholderTextColor={colors.slate500}
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
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brand.primary} />
          <Text style={styles.loadingText}>Loading matrimonial candidates...</Text>
        </View>
      ) : current ? (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            {/* Candidate Image */}
            <View style={styles.imageWrapper}>
              <Image
                source={{
                  uri:
                    current.photos?.[photoIndex]?.url ||
                    current.photos?.[0]?.url ||
                    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800",
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
                <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.tapLeft}
                    onPress={() =>
                      setPhotoIndex((prev) =>
                        prev > 0 ? prev - 1 : current.photos.length - 1
                      )
                    }
                  />
                  <TouchableOpacity
                    style={styles.tapRight}
                    onPress={() =>
                      setPhotoIndex((prev) =>
                        prev < current.photos.length - 1 ? prev + 1 : 0
                      )
                    }
                  />
                </View>
              )}

              {/* Match Score Badge */}
              <View style={styles.matchBadge}>
                <Ionicons name="sparkles" size={12} color={brand.primary} />
                <Text style={styles.matchBadgeText}>
                  {current.matchScore || 95}% Match
                </Text>
              </View>

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
                  <Ionicons name="location-sharp" size={14} color={brand.primary} />
                  <Text style={styles.locationText}>
                    {current.location?.city || "Kathmandu"}, Nepal
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
                    <View style={[styles.badge, { backgroundColor: "rgba(236,72,153,0.15)" }]}>
                      <Text style={[styles.badgeText, { color: "#f472b6" }]}>
                        {current.rashi}
                      </Text>
                    </View>
                  )}
                  {current.gotra && (
                    <View style={[styles.badge, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
                      <Text style={[styles.badgeText, { color: "#fbbf24" }]}>
                        {current.gotra}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* View Full Biodata Bar */}
            <TouchableOpacity
              style={styles.biodataBar}
              onPress={() => setDetailCandidate(current)}
              activeOpacity={0.8}
            >
              <Ionicons name="document-text-outline" size={15} color={brand.primary} />
              <Text style={styles.biodataBarText}>View Full Matrimonial Biodata</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.slate400} />
            </TouchableOpacity>

            {/* Actions Bar */}
            <View style={styles.actionsBar}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.passBtn]}
                onPress={onPass}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={26} color="#f43f5e" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.superLikeBtn]}
                onPress={onSuperLike}
                activeOpacity={0.8}
              >
                <Ionicons name="star" size={22} color="#3b82f6" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.likeBtn]}
                onPress={onLike}
                activeOpacity={0.8}
              >
                <Ionicons name="heart" size={28} color={colors.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.centerContainer}>
          <Ionicons name="sparkles-outline" size={48} color={colors.slate600} />
          <Text style={styles.noMoreTitle}>No More Profiles</Text>
          <Text style={styles.noMoreSub}>
            You've explored all matrimonial candidates matching your current filters.
          </Text>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              setCurrentIndex(0);
              fetchProfiles();
            }}
          >
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.refreshBtnText}>Reset &amp; Refresh</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Full Biodata Modal */}
      {detailCandidate && (
        <Modal
          visible={!!detailCandidate}
          animationType="slide"
          transparent
          onRequestClose={() => setDetailCandidate(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{detailCandidate.name}</Text>
                  <Text style={styles.modalSub}>
                    {detailCandidate.location?.city || "Nepal"} • Verified Biodata
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setDetailCandidate(null)}
                >
                  <Ionicons name="close" size={22} color={colors.slate300} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                {/* Biodata Cards */}
                <Text style={styles.sectionHeader}>HOROSCOPE &amp; BACKGROUND</Text>
                <View style={styles.gridContainer}>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Rashi (Zodiac)</Text>
                    <Text style={styles.gridVal}>{detailCandidate.rashi || "Tula"}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Gotra</Text>
                    <Text style={styles.gridVal}>{detailCandidate.gotra || "Kashyap"}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Caste &amp; Community</Text>
                    <Text style={styles.gridVal}>{detailCandidate.caste || "Brahmin"}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Diet &amp; Height</Text>
                    <Text style={styles.gridVal}>
                      {detailCandidate.diet || "Vegetarian"} • {detailCandidate.height || "5'5\""}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.sectionHeader, { marginTop: 16 }]}>CAREER &amp; EDUCATION</Text>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardTitle}>{detailCandidate.occupation || "Professional"}</Text>
                  <Text style={styles.detailCardSub}>{detailCandidate.education || "University Graduate"}</Text>
                </View>

                <Text style={[styles.sectionHeader, { marginTop: 16 }]}>FAMILY DETAILS</Text>
                <View style={styles.detailCard}>
                  <Text style={styles.detailCardText}>
                    {detailCandidate.familyType || "Respected nuclear family residing in Nepal."}
                  </Text>
                </View>

                <Text style={[styles.sectionHeader, { marginTop: 16 }]}>ABOUT ME</Text>
                <View style={[styles.detailCard, { marginBottom: 30 }]}>
                  <Text style={styles.detailCardText}>{detailCandidate.bio || "Looking for a meaningful life partner."}</Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

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
                You and {matchAlert.name} have expressed mutual matrimonial interest.
              </Text>

              <TouchableOpacity
                style={styles.celebrationActionBtn}
                onPress={() => {
                  setMatchAlert(null);
                  navigation.navigate("Messages");
                }}
              >
                <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
                <Text style={styles.celebrationActionText}>Send First Message</Text>
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
  container: {
    flex: 1,
    backgroundColor: colors.slate950,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate900,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 10,
    color: colors.slate400,
    marginTop: 1,
    fontWeight: "500",
  },
  headerBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedTag: {
    backgroundColor: "rgba(236, 72, 153, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(236, 72, 153, 0.3)",
  },
  verifiedTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#f472b6",
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.slate900,
    borderWidth: 1,
    borderColor: colors.slate800,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  chatBadgeDot: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: brand.to,
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: colors.slate950,
  },
  chatBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
  },
  filterBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.slate900,
    borderWidth: 1,
    borderColor: colors.slate800,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBtnActive: {
    backgroundColor: brand.primary,
    borderColor: brand.primary,
  },
  filterDrawer: {
    backgroundColor: colors.slate900,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
  },
  filterRow: {
    marginBottom: 10,
  },
  filterCol: {},
  filterLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.slate400,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.slate800,
  },
  chipActive: {
    backgroundColor: brand.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.slate300,
  },
  chipTextActive: {
    color: colors.white,
  },
  input: {
    backgroundColor: colors.slate950,
    borderWidth: 1,
    borderColor: colors.slate800,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.white,
    fontSize: 13,
  },
  applyFilterBtn: {
    backgroundColor: brand.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  applyFilterText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
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
    backgroundColor: colors.slate900,
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.slate800,
    ...cardShadow,
  },
  imageWrapper: {
    flex: 1,
    position: "relative",
    backgroundColor: colors.slate950,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
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
  photoDotActive: {
    backgroundColor: colors.white,
  },
  tapLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
  },
  tapRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "50%",
  },
  matchBadge: {
    position: "absolute",
    top: 16,
    right: 12,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.3)",
    zIndex: 10,
  },
  matchBadgeText: {
    color: brand.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  infoOverlay: {
    position: "absolute",
    bottom: 12,
    left: 14,
    right: 14,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  candidateName: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.white,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  locationText: {
    fontSize: 12,
    color: colors.slate300,
    marginLeft: 4,
  },
  bullet: {
    color: colors.slate500,
    marginHorizontal: 6,
  },
  occupationText: {
    fontSize: 12,
    color: colors.slate300,
    flex: 1,
  },
  tagStrip: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  badge: {
    backgroundColor: "rgba(139,92,246,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  badgeText: {
    color: "#a78bfa",
    fontSize: 10,
    fontWeight: "700",
  },
  biodataBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: colors.slate950,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.slate800,
  },
  biodataBarText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.slate200,
  },
  actionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.slate900,
  },
  actionBtn: {
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  passBtn: {
    width: 48,
    height: 48,
    backgroundColor: colors.slate950,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.3)",
  },
  superLikeBtn: {
    width: 42,
    height: 42,
    backgroundColor: colors.slate950,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
  },
  likeBtn: {
    width: 56,
    height: 56,
    backgroundColor: brand.primary,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: colors.slate400,
    fontSize: 13,
    marginTop: 12,
  },
  noMoreTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 12,
  },
  noMoreSub: {
    color: colors.slate400,
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
    backgroundColor: brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  refreshBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.slate900,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    padding: 18,
    borderWidth: 1,
    borderColor: colors.slate800,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate800,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.white,
  },
  modalSub: {
    fontSize: 12,
    color: colors.slate400,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.slate800,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    paddingTop: 14,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.slate400,
    letterSpacing: 1,
    marginBottom: 8,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridItem: {
    width: "48%",
    backgroundColor: colors.slate950,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.slate800,
  },
  gridLabel: {
    fontSize: 10,
    color: colors.slate500,
    marginBottom: 2,
  },
  gridVal: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.slate200,
  },
  detailCard: {
    backgroundColor: colors.slate950,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.slate800,
  },
  detailCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.slate200,
  },
  detailCardSub: {
    fontSize: 12,
    color: colors.slate400,
    marginTop: 2,
  },
  detailCardText: {
    fontSize: 12,
    color: colors.slate300,
    lineHeight: 18,
  },
  celebrationBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  celebrationCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: colors.slate900,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(236,72,153,0.3)",
    ...cardShadow,
  },
  celebrationIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: brand.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  celebrationTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.white,
  },
  celebrationSub: {
    fontSize: 13,
    color: colors.slate300,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  celebrationActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: brand.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    marginTop: 20,
    width: "100%",
    justifyContent: "center",
  },
  celebrationActionText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 13,
  },
  celebrationDismissBtn: {
    marginTop: 10,
    paddingVertical: 8,
  },
  celebrationDismissText: {
    color: colors.slate400,
    fontSize: 12,
    fontWeight: "600",
  },
});
