// src/components/feed/PostCard.tsx
import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, brand, radius, cardShadow } from "../../theme";
import { NormalizedPost, authorAvatar, imageUrl } from "./types";
import { isObjectId } from "../../utils/media";

interface Props {
  post: NormalizedPost;
  onToggleLike: (postId: string) => void;
  onOpenComments: (post: NormalizedPost) => void;
  onAuthorPress: (userId: string) => void;
  onShare: (postId: string) => void; // opens the tracked ShareModal (web sharePost parity)
}

export default function PostCard({
  post,
  onToggleLike,
  onOpenComments,
  onAuthorPress,
  onShare,
}: Props) {
  const safeImages = (post.images || []).map(imageUrl).filter(Boolean) as {
    uri: string;
  }[];
  return (
    <View style={st.card}>
      <View style={st.authorRow}>
        <TouchableOpacity
          onPress={() =>
            post.author?._id &&
            isObjectId(post.author._id) &&
            onAuthorPress(String(post.author._id))
          }
          disabled={!(post.author?._id && isObjectId(post.author._id))}
        >
          <Image source={authorAvatar(post.author)} style={st.avatar} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.name}>{post.author?.name || "Unknown"}</Text>
          <Text style={st.meta} numberOfLines={1}>
            {post.author?.occupation || ""}
          </Text>
        </View>
      </View>
      {!!post.content && <Text style={st.content}>{post.content}</Text>}
      {safeImages.length > 0 && (
        <View style={st.imgGrid}>
          {safeImages.slice(0, 4).map((src, i) => (
            <Image
              key={i}
              source={src}
              style={[st.img, safeImages.length === 1 ? st.imgSingle : null]}
              resizeMode="cover"
            />
          ))}
        </View>
      )}
      <View style={st.footer}>
        <TouchableOpacity
          style={st.act}
          onPress={() => onToggleLike(post._id)}
          accessibilityRole="button"
          accessibilityState={{ selected: post.isLiked }}
        >
          <Ionicons
            name={post.isLiked ? "heart" : "heart-outline"}
            size={20}
            color={post.isLiked ? "#ec4899" : colors.subtext}
          />
          <Text style={[st.actTxt, post.isLiked && st.actLiked]}>
            {post.likesCount} {post.likesCount === 1 ? "Like" : "Likes"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.act}
          onPress={() => onOpenComments(post)}
          accessibilityRole="button"
        >
          <Ionicons
            name="chatbubble-outline"
            size={19}
            color={colors.subtext}
          />
          <Text style={st.actTxt}>
            {post.commentsCount}{" "}
            {post.commentsCount === 1 ? "Comment" : "Comments"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.act}
          onPress={() => onShare(post._id)}
          accessibilityRole="button"
          accessibilityLabel="Share post"
        >
          <Ionicons
            name="share-social-outline"
            size={19}
            color={colors.subtext}
          />
          <Text style={st.actTxt}>
            {post.sharesCount > 0 ? `${post.sharesCount} Shares` : "Share"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    ...cardShadow,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.inputFill,
  },
  name: { fontSize: 15, fontWeight: "800", color: colors.heading },
  meta: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  content: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.heading,
    marginBottom: 10,
  },
  imgGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  img: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.inputFill,
  },
  imgSingle: { width: "100%", aspectRatio: 16 / 10 },
  footer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
    paddingTop: 10,
    justifyContent: "space-around",
  },
  act: { flexDirection: "row", alignItems: "center", gap: 6 },
  actTxt: { fontSize: 13, color: colors.subtext, fontWeight: "600" },
  actLiked: { color: "#ec4899", fontWeight: "700" },
});
