// src/screens/UserProfileScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, brand, radius, cardShadow } from "../../theme";
import { likeCandidate, unlikeCandidate } from "../../api/discovery";
import { getUserProfile, reportUser, toggleBlockUser } from "../../api/user";

const { width } = Dimensions.get("window");

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [isLiked, setIsLiked] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const [isProcessingLike, setIsProcessingLike] = useState(false);

  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [isReporting, setIsReporting] = useState(false);

  const userId = route.params?.userId;

  const isValidUserId = (id: string): boolean => {
    return typeof id === "string" && id.length > 0 && id.length <= 100;
  };

  const fetchProfile = useCallback(async () => {
    if (!userId || !isValidUserId(userId)) {
      setError("Invalid user ID");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data: any = await getUserProfile(userId);

      if (data.success) {
        setProfile(data.user);
        setIsLiked(data.user.isLiked || false);
        setIsMatched(data.user.isMatched || false);
        setIsBlocked(false);
      }
    } catch (err: any) {
      if (err.response?.status === 403 && err.response?.data?.blocked) {
        setIsBlocked(true);
        setError("You cannot view this profile");
      } else {
        console.error("Failed to fetch profile:", err);
        setError(err.response?.data?.message || "Unable to load profile");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLikeToggle = async () => {
    if (!profile || isProcessingLike || isBlocked) return;

    setIsProcessingLike(true);
    const previousLiked = isLiked;

    try {
      if (isLiked) {
        await unlikeCandidate(profile._id);
        setIsLiked(false);
        setIsMatched(false);
      } else {
        const res: any = await likeCandidate(profile._id);
        setIsLiked(true);
        if (res?.matched) {
          setIsMatched(true);
          Alert.alert(
            "It's a Match! 💕",
            `You and ${profile.name} liked each other!`
          );
        }
      }
    } catch (err: any) {
      setIsLiked(previousLiked);
      console.error("Failed to toggle like:", err);
      Alert.alert("Error", "Failed to update. Please try again.");
    } finally {
      setIsProcessingLike(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!userId || isBlocking || !isValidUserId(userId)) return;

    setIsBlocking(true);
    try {
      const res: any = await toggleBlockUser(userId);
      setIsBlocked(res.blocked);
      Alert.alert(
        res.blocked ? "User Blocked 🚫" : "User Unblocked",
        res.blocked
          ? `${profile?.name} has been blocked successfully.`
          : `${profile?.name} has been unblocked.`
      );
      setShowBlockConfirm(false);

      if (res.blocked) {
        setError("You cannot view this profile");
      } else {
        setError("");
        fetchProfile();
      }
    } catch (err: any) {
      console.error("Failed to toggle block:", err);
      Alert.alert(
        "Error",
        err.response?.data?.message || "Failed to update block status"
      );
    } finally {
      setIsBlocking(false);
    }
  };

  const handleReport = async () => {
    if (!userId || !reportMessage.trim() || isReporting) return;

    const trimmedMessage = reportMessage.trim();

    // Validate message length
    if (trimmedMessage.length < 10) {
      Alert.alert(
        "Report Too Short",
        `Please provide at least 10 characters (currently ${trimmedMessage.length}). More details help us investigate better.`
      );
      return;
    }

    if (trimmedMessage.length > 1000) {
      Alert.alert(
        "Report Too Long",
        "Please keep your report under 1000 characters."
      );
      return;
    }

    // Basic XSS prevention
    const sanitizedMessage = trimmedMessage.replace(/<[^>]*>/g, "");

    setIsReporting(true);
    try {
      const res: any = await reportUser(userId, sanitizedMessage);

      // Check for cooldown error
      if (
        res.message?.includes("24 hours") ||
        res.message?.includes("already reported")
      ) {
        Alert.alert(
          "Report Already Submitted",
          "You have already reported this user recently. Please wait 24 hours before submitting another report.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Report Submitted ",
          res.message ||
            "Thank you for your report. Our team will review it soon."
        );
        setShowReportModal(false);
        setReportMessage("");
      }
    } catch (err: any) {
      console.error("Failed to report user:", err);

      // Handle 429 Too Many Requests (cooldown)
      if (err.response?.status === 429) {
        Alert.alert(
          "Please Wait",
          "You've already reported this user recently. Please wait 24 hours before submitting another report."
        );
      } else if (err.response?.status === 400) {
        Alert.alert(
          "Invalid Report",
          err.response?.data?.message ||
            "Please provide a valid report message."
        );
      } else {
        Alert.alert(
          "Error",
          err.response?.data?.message ||
            "Failed to submit report. Please try again."
        );
      }
    } finally {
      setIsReporting(false);
    }
  };

  const calculateAge = (dateOfBirth: string) => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brand.from} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerContainer}>
          <Ionicons
            name="person-remove-outline"
            size={64}
            color={colors.subtext}
          />
          <Text style={styles.errorTitle}>{error || "User not found"}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={16} color={colors.white} />
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const age = calculateAge(profile.dateOfBirth);
  const photos = profile.photos || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image Section */}
        <View style={styles.heroWrap}>
          {photos.length > 0 ? (
            <TouchableOpacity
              style={styles.heroImageContainer}
              onPress={() => setLightboxIndex(0)}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri: photos[0]?.url }}
                style={styles.heroImg}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.heroImgPlaceholder}>
              <Ionicons
                name="person-outline"
                size={120}
                color={colors.subtext}
              />
            </View>
          )}

          {/* Back Button */}
          <TouchableOpacity
            style={[styles.floatingBackBtn, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>

          {/* Online Badge */}
          {profile.isOnline && (
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          )}
        </View>

        {/* User Info Section - Below Image */}
        <View style={styles.userInfoSection}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText}>{profile.name}</Text>
            {profile.isVerified && (
              <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            )}
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoText}>{age ? `${age} years` : ""}</Text>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.infoText}>
              {profile.occupation || "Professional"}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color={colors.subtext} />
            <Text style={styles.locationText}>
              {profile.location?.city || "Nepal"}
            </Text>
          </View>

          {profile.matchScore && (
            <View style={styles.matchScoreBadge}>
              <Ionicons name="sparkles" size={16} color="#fbbf24" />
              <Text style={styles.matchScoreText}>
                {profile.matchScore}% Match
              </Text>
            </View>
          )}
        </View>

        {/* Profile Details */}
        <View style={styles.detailsContent}>
          {profile.bio && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-outline" size={18} color={brand.from} />
                <Text style={styles.cardTitle}>About {profile.name}</Text>
              </View>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          )}

          {(profile.rashi ||
            profile.gotra ||
            profile.caste ||
            profile.religion) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="moon-outline" size={18} color={brand.to} />
                <Text style={styles.cardTitle}>Horoscope & Background</Text>
              </View>
              <View style={styles.statsGrid}>
                {profile.rashi && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Rashi</Text>
                    <Text style={styles.statVal}>{profile.rashi}</Text>
                  </View>
                )}
                {profile.gotra && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Gotra</Text>
                    <Text style={styles.statVal}>{profile.gotra}</Text>
                  </View>
                )}
                {profile.caste && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Caste</Text>
                    <Text style={styles.statVal}>{profile.caste}</Text>
                  </View>
                )}
                {profile.religion && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Religion</Text>
                    <Text style={styles.statVal}>{profile.religion}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {(profile.education || profile.height) && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="briefcase-outline" size={18} color={brand.to} />
                <Text style={styles.cardTitle}>Education & Details</Text>
              </View>
              <View style={styles.statsGrid}>
                {profile.education && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Education</Text>
                    <Text style={styles.statVal}>{profile.education}</Text>
                  </View>
                )}
                {profile.height && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Height</Text>
                    <Text style={styles.statVal}>{profile.height}</Text>
                  </View>
                )}
                {profile.relationshipGoal && (
                  <View style={[styles.statBox, styles.fullWidth]}>
                    <Text style={styles.statLabel}>Looking For</Text>
                    <Text style={styles.statVal}>
                      {profile.relationshipGoal}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {photos.length > 1 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="images-outline" size={18} color={brand.to} />
                <Text style={styles.cardTitle}>
                  More Photos ({photos.length})
                </Text>
              </View>
              <View style={styles.photosGrid}>
                {photos.slice(1).map((photo: any, index: number) => (
                  <TouchableOpacity
                    key={photo._id || index}
                    style={styles.photoThumb}
                    onPress={() => setLightboxIndex(index + 1)}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: photo.url }}
                      style={styles.photoThumbImg}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {isMatched && (
            <View style={styles.matchedBanner}>
              <Ionicons name="heart" size={24} color={colors.white} />
              <Text style={styles.matchedText}>
                You are matched with {profile.name}!
              </Text>
            </View>
          )}

          {isBlocked && (
            <View style={styles.blockedBanner}>
              <Ionicons name="ban-outline" size={20} color={colors.danger} />
              <Text style={styles.blockedText}>You have blocked this user</Text>
            </View>
          )}
        </View>
      </ScrollView>
      {/* Bottom Action Bar */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.likeButton,
            {
              backgroundColor: isLiked ? colors.danger : brand.from,
              opacity: isBlocked || isProcessingLike ? 0.5 : 1,
            },
          ]}
          onPress={handleLikeToggle}
          disabled={isBlocked || isProcessingLike}
          activeOpacity={0.8}
        >
          {isProcessingLike ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons
                name={isLiked ? "heart-dislike" : "heart"}
                size={22}
                color={colors.white}
              />
              <Text style={styles.likeButtonText}>
                {isLiked ? "Unlike" : "Like"}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {isMatched && !isBlocked && (
          <TouchableOpacity
            style={styles.messageButton}
            onPress={() =>
              navigation.navigate("ChatDetail", { userId: profile._id })
            }
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble" size={20} color={colors.white} />
            <Text style={styles.messageButtonText}>Message</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.reportButton}
            onPress={() => setShowReportModal(true)}
            disabled={isBlocked}
            activeOpacity={0.8}
          >
            <Ionicons name="flag-outline" size={18} color="#f59e0b" />
            <Text style={styles.reportButtonText}>Report</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.blockButton,
              { borderColor: isBlocked ? colors.subtext : colors.danger },
            ]}
            onPress={() => setShowBlockConfirm(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isBlocked ? "lock-open-outline" : "ban-outline"}
              size={18}
              color={isBlocked ? colors.subtext : colors.danger}
            />
            <Text
              style={[
                styles.blockButtonText,
                { color: isBlocked ? colors.subtext : colors.danger },
              ]}
            >
              {isBlocked ? "Unblock" : "Block"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Photo Lightbox Modal */}
      <Modal
        visible={lightboxIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxIndex(null)}
      >
        <View style={styles.lightboxContainer}>
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => setLightboxIndex(null)}
          >
            <Ionicons name="close" size={32} color={colors.white} />
          </TouchableOpacity>
          {photos[lightboxIndex!]?.url && (
            <Image
              source={{ uri: photos[lightboxIndex!]?.url }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          {photos.length > 1 && (
            <View style={styles.lightboxNav}>
              <TouchableOpacity
                style={styles.lightboxNavButton}
                onPress={() => {
                  if (lightboxIndex! > 0) setLightboxIndex(lightboxIndex! - 1);
                }}
                disabled={lightboxIndex === 0}
              >
                <Ionicons
                  name="chevron-back"
                  size={32}
                  color={lightboxIndex === 0 ? "#666" : colors.white}
                />
              </TouchableOpacity>
              <Text style={styles.lightboxCounter}>
                {lightboxIndex! + 1} / {photos.length}
              </Text>
              <TouchableOpacity
                style={styles.lightboxNavButton}
                onPress={() => {
                  if (lightboxIndex! < photos.length - 1)
                    setLightboxIndex(lightboxIndex! + 1);
                }}
                disabled={lightboxIndex === photos.length - 1}
              >
                <Ionicons
                  name="chevron-forward"
                  size={32}
                  color={
                    lightboxIndex === photos.length - 1 ? "#666" : colors.white
                  }
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
      // Update the Report Modal section with these changes:
      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reportModalContent}>
            {" "}
            {/* Changed from modalContent */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="flag" size={24} color="#f59e0b" />
                <Text style={[styles.modalTitle, { color: "#92400e" }]}>
                  Report {profile.name}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Ionicons name="close" size={24} color="#78350f" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: "#78350f" }]}>
              Tell us what's wrong. Our moderation team will review this report.
            </Text>
            <Text style={[styles.label, { color: "#92400e" }]}>
              Reason for reporting *
            </Text>
            <View style={styles.textareaContainer}>
              <TextInput
                style={[
                  styles.textarea,
                  {
                    backgroundColor: "#fef3c7",
                    borderColor: "#fbbf24",
                    color: "#78350f",
                  },
                ]}
                placeholder="e.g. Fake profile, abusive messages..."
                placeholderTextColor="#b45309"
                value={reportMessage}
                onChangeText={setReportMessage}
                multiline
                maxLength={1000}
                textAlignVertical="top"
                autoCapitalize="sentences"
              />
              <Text style={[styles.charCount, { color: "#b45309" }]}>
                {reportMessage.length}/1000
              </Text>
            </View>
            {/* Show validation message */}
            {reportMessage.trim().length > 0 &&
              reportMessage.trim().length < 10 && (
                <Text style={styles.validationText}>
                  Please enter at least {10 - reportMessage.trim().length} more
                  characters
                </Text>
              )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowReportModal(false);
                  setReportMessage("");
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitReportButton,
                  {
                    opacity: reportMessage.trim().length < 10 ? 0.5 : 1,
                    backgroundColor: "#f59e0b",
                  },
                ]}
                onPress={handleReport}
                disabled={isReporting || reportMessage.trim().length < 10}
              >
                {isReporting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#ffffff" />
                    <Text style={styles.submitReportText}>Submit Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Block Confirmation Modal */}
      <Modal
        visible={showBlockConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons
                  name={isBlocked ? "lock-open" : "ban"}
                  size={24}
                  color={isBlocked ? colors.subtext : colors.danger}
                />
                <Text style={styles.modalTitle}>
                  {isBlocked
                    ? `Unblock ${profile.name}?`
                    : `Block ${profile.name}?`}
                </Text>
              </View>
            </View>
            <Text style={styles.modalSubtitle}>
              {isBlocked
                ? "They will be able to see your profile and send you messages again."
                : "They won't be able to see your profile, send you messages, or match with you. You can unblock them anytime."}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowBlockConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmBlockButton,
                  { backgroundColor: isBlocked ? colors.link : colors.danger },
                ]}
                onPress={handleBlockToggle}
                disabled={isBlocking}
              >
                {isBlocking ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons
                      name={isBlocked ? "lock-open" : "ban"}
                      size={16}
                      color={colors.white}
                    />
                    <Text style={styles.confirmBlockText}>
                      {isBlocked ? "Unblock" : "Block"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },

  centerContainer: {
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

  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.heading,
    marginTop: 12,
    textAlign: "center",
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    backgroundColor: "#E11D74",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.button,
  },

  backButtonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },

  heroWrap: { width: "100%", height: 380, position: "relative" },
  heroImageContainer: { width: "100%", height: "100%" },
  heroImg: { width: "100%", height: "100%" },

  heroImgPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FCE7F3",
    alignItems: "center",
    justifyContent: "center",
  },

  floatingBackBtn: {
    position: "absolute",
    left: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(25, 10, 20, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  onlineBadge: {
    position: "absolute",
    top: 18,
    right: 18,
    backgroundColor: "rgba(5, 150, 105, 0.96)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },

  onlineText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "700",
  },

  // User info section below image
  userInfoSection: {
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: "#FBCFE8",
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  nameText: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.heading,
    flex: 1,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },

  infoText: {
    fontSize: 16,
    color: colors.subtext,
  },

  bullet: {
    color: "#E11D74",
    fontSize: 16,
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  },

  locationText: {
    fontSize: 15,
    color: colors.subtext,
  },

  matchScoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
    marginTop: 4,
  },

  matchScoreText: {
    color: "#92400E",
    fontSize: 14,
    fontWeight: "700",
  },

  detailsContent: { padding: 16, gap: 14 },

  card: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "#FBCFE8",
    gap: 10,
    ...cardShadow,
  },

  cardHeader: {
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
    backgroundColor: "#FFF1F7",
    padding: 10,
    borderRadius: radius.field,
  },

  fullWidth: { width: "100%" },

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

  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  photoThumb: {
    width: (width - 64) / 3,
    height: (width - 64) / 3,
    borderRadius: radius.field,
    overflow: "hidden",
    backgroundColor: "#FCE7F3",
  },

  photoThumbImg: { width: "100%", height: "100%" },

  matchedBanner: {
    backgroundColor: "#059669",
    padding: 16,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  matchedText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },

  blockedBanner: {
    backgroundColor: "#FEF2F2",
    padding: 16,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },

  blockedText: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: "#FBCFE8",
    gap: 10,
    shadowColor: "#881337",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },

  likeButton: {
    paddingVertical: 14,
    borderRadius: radius.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  likeButtonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
  },

  messageButton: {
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: radius.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  messageButtonText: {
    color: colors.white,
    fontWeight: "800",
    fontSize: 16,
  },

  actionButtonsRow: { flexDirection: "row", gap: 10 },

  reportButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#EA580C",
  },

  reportButtonText: {
    color: "#C2410C",
    fontWeight: "700",
    fontSize: 14,
  },

  blockButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "#E5B4C8",
  },

  blockButtonText: {
    fontWeight: "700",
    fontSize: 14,
    color: "#9D174D",
  },

  lightboxContainer: {
    flex: 1,
    backgroundColor: "rgba(20, 5, 15, 0.97)",
    alignItems: "center",
    justifyContent: "center",
  },

  lightboxClose: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 10,
    padding: 8,
  },

  lightboxImage: { width: "100%", height: "100%" },

  lightboxNav: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },

  lightboxNavButton: { padding: 8 },

  lightboxCounter: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 10, 25, 0.60)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalContent: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.heading,
    flex: 1,
  },

  modalSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginBottom: 16,
    lineHeight: 20,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.label,
    marginBottom: 8,
  },

  textareaContainer: { position: "relative", marginBottom: 16 },

  textarea: {
    backgroundColor: "#FFF7FA",
    borderWidth: 1,
    borderColor: "#F3B8D1",
    borderRadius: radius.field,
    padding: 12,
    fontSize: 14,
    color: colors.heading,
    minHeight: 120,
  },

  charCount: {
    position: "absolute",
    bottom: 8,
    right: 12,
    fontSize: 12,
    color: colors.subtext,
  },

  modalButtons: { flexDirection: "row", gap: 10 },

  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: "#FCE7F3",
    alignItems: "center",
  },

  cancelButtonText: {
    color: "#9D174D",
    fontWeight: "700",
    fontSize: 14,
  },

  submitReportButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.button,
    backgroundColor: "#E11D74",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  submitReportText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },

  confirmBlockButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  confirmBlockText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },

  reportModalContent: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    borderWidth: 2,
    borderColor: "#F9A8D4",
  },

  validationText: {
    fontSize: 12,
    color: "#B45309",
    marginTop: 4,
    marginBottom: 8,
    fontStyle: "italic",
  },
});
