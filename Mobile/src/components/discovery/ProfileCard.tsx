// src/components/discovery/ProfileCard.tsx
// Extracted from DiscoverScreen's inline swipe card. The candidate photo is the ONLY
// attacker-controlled remote string this screen renders, so it is gated here at the single
// choke point: https + host-allowlist (constants/mediaHosts.ts, unsplash EXCLUDED) or the
// bundled avatar. Data flow / handlers live in the screen; this component is presentational.
import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, brand, radius, cardShadow } from "../../theme";
import { isSafeMediaUrl } from "../../utils/media";
import type { CandidateUser } from "../../api/discovery";

// depth-2 (src/components/discovery/) => 3 hops to Mobile/assets
const DEFAULT_AVATAR = require("../../../assets/default-avatar.png");

interface Props {
  user: CandidateUser;
  photoIndex: number;
  onPhotoPrev: () => void;
  onPhotoNext: () => void;
  onViewProfile: () => void;
  onPass: () => void;
  onLike: () => void;
  likeIcon: string; // resolved by the screen's getLikeButtonConfig (cast once below)
  likeColor: string;
  likeSize: number;
  isProcessingLike: boolean;
}

// SECURITY: was `source={{ uri: <raw url> }}`. Now the final URL must pass isSafeMediaUrl
// (https + allowlist) or we fall back to the bundled avatar. Preserves the original
// photos[photoIndex] || photos[0] preference chain; a malicious profile can no longer steer
// the card to fetch an off-allowlist / cleartext host (the casino-PWA vector).
function cardSource(
  user: CandidateUser,
  photoIndex: number
): { uri: string } | number {
  const photos = (user as any)?.photos;
  const url =
    (Array.isArray(photos) && photos[photoIndex]?.url) ||
    photos?.[0]?.url ||
    null;
  return isSafeMediaUrl(url) ? { uri: url as string } : DEFAULT_AVATAR;
}

export default function ProfileCard({
  user,
  photoIndex,
  onPhotoPrev,
  onPhotoNext,
  onViewProfile,
  onPass,
  onLike,
  likeIcon,
  likeColor,
  likeSize,
  isProcessingLike,
}: Props) {
  const photoCount = Array.isArray((user as any).photos)
    ? (user as any).photos.length
    : 0;
  const src = cardSource(user, photoIndex);

  return (
    <View style={st.cardContainer}>
      <View style={st.card}>
        <View style={st.imageWrapper}>
          <Image source={src as any} style={st.cardImage} resizeMode="cover" />

          {photoCount > 1 && (
            <View style={st.photoIndicators}>
              {(user as any).photos.map((_: unknown, i: number) => (
                <View
                  key={i}
                  style={[st.photoDot, i === photoIndex && st.photoDotActive]}
                />
              ))}
            </View>
          )}

          {photoCount > 1 && (
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
                style={st.tapLeft}
                onPress={onPhotoPrev}
                accessibilityLabel="Previous photo"
              />
              <TouchableOpacity
                style={st.tapRight}
                onPress={onPhotoNext}
                accessibilityLabel="Next photo"
              />
            </View>
          )}

          {(user as any).matchScore && (
            <View style={st.matchBadge}>
              <Ionicons name="sparkles" size={12} color={brand.from} />
              <Text style={st.matchBadgeText}>
                {(user as any).matchScore}% Match
              </Text>
            </View>
          )}

          <LinearGradient
            colors={["transparent", "rgba(15, 23, 42, 0.95)"]}
            style={st.imageGradient}
          />

          <View style={st.infoOverlay}>
            <View style={st.nameRow}>
              <Text style={st.candidateName}>{(user as any).name}</Text>
              {(user as any).isVerified && (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#10b981"
                  style={{ marginLeft: 6 }}
                />
              )}
            </View>
            <View style={st.locationRow}>
              <Ionicons name="location-sharp" size={14} color={colors.white} />
              <Text style={st.locationText}>
                {(user as any).location?.city || "Nepal"}
              </Text>
              <Text style={st.bullet}>•</Text>
              <Text style={st.occupationText} numberOfLines={1}>
                {(user as any).occupation || "Professional"}
              </Text>
            </View>
            <View style={st.tagStrip}>
              {(user as any).caste && (
                <View style={st.badge}>
                  <Text style={st.badgeText}>{(user as any).caste}</Text>
                </View>
              )}
              {(user as any).rashi && (
                <View
                  style={[
                    st.badge,
                    { backgroundColor: "rgba(236,72,153,0.15)" },
                  ]}
                >
                  <Text style={[st.badgeText, { color: "#f472b6" }]}>
                    {(user as any).rashi}
                  </Text>
                </View>
              )}
              {(user as any).gotra && (
                <View
                  style={[
                    st.badge,
                    { backgroundColor: "rgba(245,158,11,0.15)" },
                  ]}
                >
                  <Text style={[st.badgeText, { color: "#fbbf24" }]}>
                    {(user as any).gotra}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={st.biodataBar}
          onPress={onViewProfile}
          activeOpacity={0.8}
        >
          <Ionicons
            name="document-text-outline"
            size={15}
            color={colors.iconTint}
          />
          <Text style={st.biodataBarText}>View Full Matrimonial Biodata</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.subtext} />
        </TouchableOpacity>

        <View style={st.actionsBar}>
          <TouchableOpacity
            style={[st.actionBtn, st.passBtn]}
            onPress={onPass}
            activeOpacity={0.8}
            accessibilityLabel="Pass"
          >
            <Ionicons name="close" size={26} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[st.actionBtn, st.profileBtn]}
            onPress={onViewProfile}
            activeOpacity={0.8}
            accessibilityLabel="View profile"
          >
            <Ionicons name="person" size={24} color={colors.link} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              st.actionBtn,
              {
                width: 56,
                height: 56,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor:
                  /* like state */ likeColor === "#ef4444"
                    ? "#ef4444"
                    : brand.from,
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
            accessibilityLabel="Like"
          >
            {isProcessingLike ? (
              <ActivityIndicator size="small" color={colors.subtext} />
            ) : (
              <Ionicons
                name={likeIcon as any}
                size={likeSize}
                color={likeColor}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// styles relocated VERBATIM from DiscoverScreen (no value edits) so render is identical
const st = StyleSheet.create({
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
});
