// src/screens/FeedScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../theme";
import {
  fetchFeedPosts,
  togglePostLike,
  addPostComment,
  FeedPost,
} from "../api/posts";

const SAMPLE_POSTS: FeedPost[] = [
  {
    _id: "post-1",
    author: {
      _id: "a-1",
      name: "Rohit & Ananya",
      occupation: "Married via MayaMilan 💍",
      photos: [{ url: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=500" }],
    },
    content: "Two years ago we met right here on MayaMilan. Today was our traditional wedding ceremony in Pokhara with blessings from both families! Never lose hope, the right person is searching for you too.",
    images: ["https://images.unsplash.com/photo-1519741497674-611481863552?w=800"],
    likes: ["1", "2", "3", "4", "5"],
    isLiked: false,
    comments: [
      {
        _id: "c-1",
        user: { _id: "u-1", name: "Suman Joshi" },
        text: "Congratulations to both families! Truly inspiring.",
        createdAt: "1h ago",
      },
    ],
    createdAt: "3 hours ago",
  },
  {
    _id: "post-2",
    author: {
      _id: "a-2",
      name: "Dr. Sandeep Adhikari",
      occupation: "MayaMilan Relationship Counselor",
      photos: [{ url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500" }],
    },
    content: "Tip of the week for matrimonial meetings: Always discuss life goals, career expectations, and family involvement openly during the first 2-3 conversations. Transparency creates lifelong trust.",
    likes: ["1", "2", "3"],
    isLiked: true,
    comments: [],
    createdAt: "1 day ago",
  },
];

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCommentPost, setActiveCommentPost] = useState<FeedPost | null>(null);
  const [newCommentText, setNewCommentText] = useState("");

  useEffect(() => {
    async function loadFeed() {
      try {
        const res = await fetchFeedPosts();
        setPosts(res?.posts?.length ? res.posts : SAMPLE_POSTS);
      } catch {
        setPosts(SAMPLE_POSTS);
      } finally {
        setLoading(false);
      }
    }
    loadFeed();
  }, []);

  const handleLike = async (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p._id === postId) {
          const nowLiked = !p.isLiked;
          return {
            ...p,
            isLiked: nowLiked,
            likes: nowLiked ? [...p.likes, "me"] : p.likes.filter((id) => id !== "me"),
          };
        }
        return p;
      })
    );
    try {
      await togglePostLike(postId);
    } catch {}
  };

  const handleAddComment = async () => {
    if (!newCommentText.trim() || !activeCommentPost) return;
    const commentItem = {
      _id: "cm-" + Date.now(),
      user: { _id: "me", name: "You" },
      text: newCommentText.trim(),
      createdAt: "Just now",
    };

    setPosts((prev) =>
      prev.map((p) =>
        p._id === activeCommentPost._id
          ? { ...p, comments: [...p.comments, commentItem] }
          : p
      )
    );
    const commentText = newCommentText.trim();
    setNewCommentText("");

    try {
      await addPostComment(activeCommentPost._id, commentText);
    } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Matrimonial Community</Text>
          <Text style={styles.headerSub}>Stories, advice, and family updates</Text>
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate("CreatePost")}
          accessibilityLabel="Create Post"
        >
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brand.to} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.feedList}
          renderItem={({ item }) => (
            <View style={styles.postCard}>
              {/* Author Header */}
              <View style={styles.authorRow}>
                <Image
                  source={{
                    uri:
                      item.author.photos?.[0]?.url ||
                      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
                  }}
                  style={styles.authorAvatar}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorName}>{item.author.name}</Text>
                  <Text style={styles.authorMeta}>
                    {item.author.occupation} • {item.createdAt}
                  </Text>
                </View>
              </View>

              {/* Content */}
              <Text style={styles.postContent}>{item.content}</Text>

              {/* Post Images */}
              {item.images?.[0] && (
                <Image
                  source={{ uri: item.images[0] }}
                  style={styles.postImage}
                  resizeMode="cover"
                />
              )}

              {/* Action Bar */}
              <View style={styles.postFooter}>
                <TouchableOpacity
                  style={styles.footerAction}
                  onPress={() => handleLike(item._id)}
                >
                  <Ionicons
                    name={item.isLiked ? "heart" : "heart-outline"}
                    size={20}
                    color={item.isLiked ? "#ec4899" : colors.subtext}
                  />
                  <Text
                    style={[
                      styles.footerActionText,
                      item.isLiked && { color: "#ec4899", fontWeight: "700" },
                    ]}
                  >
                    {item.likes.length} Likes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.footerAction}
                  onPress={() => setActiveCommentPost(item)}
                >
                  <Ionicons name="chatbubble-outline" size={19} color={colors.subtext} />
                  <Text style={styles.footerActionText}>
                    {item.comments.length} Comments
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.footerAction}>
                  <Ionicons name="share-social-outline" size={19} color={colors.subtext} />
                  <Text style={styles.footerActionText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Comments Bottom Sheet Modal */}
      <Modal visible={!!activeCommentPost} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.commentSheet}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setActiveCommentPost(null)}>
                <Ionicons name="close" size={22} color={colors.heading} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={activeCommentPost?.comments || []}
              keyExtractor={(c) => c._id}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Text style={styles.commentUser}>{item.user.name}</Text>
                  <Text style={styles.commentBody}>{item.text}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.noCommentsText}>
                  No comments yet. Start the conversation!
                </Text>
              }
            />

            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment..."
                value={newCommentText}
                onChangeText={setNewCommentText}
              />
              <TouchableOpacity
                style={styles.commentSendBtn}
                onPress={handleAddComment}
              >
                <Ionicons name="send" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.heading,
  },
  headerSub: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
  },
  createBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: brand.to,
    alignItems: "center",
    justifyContent: "center",
  },
  feedList: {
    padding: 16,
    gap: 14,
  },
  postCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  authorName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.heading,
  },
  authorMeta: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
  },
  postContent: {
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.heading,
    marginBottom: 10,
  },
  postImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
    paddingTop: 10,
    justifyContent: "space-around",
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerActionText: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  commentSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingBottom: 20,
  },
  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  commentTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.heading,
  },
  commentItem: {
    backgroundColor: colors.inputFill,
    padding: 10,
    borderRadius: 12,
  },
  commentUser: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.heading,
  },
  commentBody: {
    fontSize: 13.5,
    color: colors.label,
    marginTop: 3,
  },
  noCommentsText: {
    textAlign: "center",
    color: colors.subtext,
    marginTop: 20,
    fontSize: 14,
  },
  commentInputRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.inputFill,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
  },
  commentSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.to,
    alignItems: "center",
    justifyContent: "center",
  },
});
