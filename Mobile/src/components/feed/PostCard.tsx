// src/components/feed/PostCard.tsx
import React, { useMemo, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, cardShadow } from "../../theme";
import { NormalizedPost, authorAvatar } from "./types";
import { isObjectId, resolveSafeMediaUrl } from "../../utils/media";

interface Props {
  post: NormalizedPost;
  onToggleLike: (postId: string) => void;
  onOpenComments: (post: NormalizedPost) => void;
  onAuthorPress: (userId: string) => void;
  onShare: (postId: string) => void;
}

type SafeImage = {
  uri: string;
};

export default function PostCard({
  post,
  onToggleLike,
  onOpenComments,
  onAuthorPress,
  onShare,
}: Props) {
  const safeImages = useMemo<SafeImage[]>(() => {
    const list = Array.isArray((post as any).images)
      ? (post as any).images
      : [];

    const out: SafeImage[] = [];

    for (const item of list) {
      const safe = resolveSafeMediaUrl(item);

      if (safe) {
        out.push({ uri: safe });
      } else if (typeof __DEV__ !== "undefined" && __DEV__) {
        // Helps identify whether the problem is "blocked by gate" vs "failed to load".
        console.warn("[PostCard] image blocked by media gate:", item);
      }
    }

    return out;
  }, [(post as any).images]);

  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const visibleImages = useMemo(
    () => safeImages.filter((img) => !failed[img.uri]),
    [failed, safeImages]
  );

  const authorId = post.author?._id;
  const canOpenAuthor = typeof authorId === "string" && isObjectId(authorId);

  return (
    <View style={st.card}>
      <View style={st.authorRow}>
        <TouchableOpacity
          onPress={() => canOpenAuthor && onAuthorPress(String(authorId))}
          disabled={!canOpenAuthor}
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

      {visibleImages.length > 0 && (
        <View style={st.imgGrid}>
          {visibleImages.slice(0, 4).map((src, i) => (
            <Image
              key={`${i}-${src.uri}`}
              source={src}
              style={[st.img, visibleImages.length === 1 ? st.imgSingle : null]}
              resizeMode="cover"
              onError={() => {
                if (typeof __DEV__ !== "undefined" && __DEV__) {
                  console.warn("[PostCard] image failed to load:", src.uri);
                }

                setFailed((f) => ({ ...f, [src.uri]: true }));
              }}
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
  name: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.heading,
  },
  meta: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
  },
  content: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.heading,
    marginBottom: 10,
  },
  imgGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  img: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.inputFill,
  },
  imgSingle: {
    width: "100%",
    aspectRatio: 16 / 10,
  },
  footer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
    paddingTop: 10,
    justifyContent: "space-around",
  },
  act: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actTxt: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: "600",
  },
  actLiked: {
    color: "#ec4899",
    fontWeight: "700",
  },
});
