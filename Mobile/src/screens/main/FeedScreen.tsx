// src/screens/main/FeedScreen.tsx
import React, {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { useSocket } from "../../hooks/useSocket";
import { PostCard, CommentItem, ShareModal } from "../../components/feed";
import type { NormalizedPost, CommentNode } from "../../components/feed/types";
import {
  normalizeComment,
  cleanText,
  MAX_COMMENT_LEN,
} from "../../components/feed/types";
import {
  fetchFeedPosts,
  togglePostLike,
  addPostComment,
} from "../../api/posts";
import { isObjectId } from "../../utils/media";

const PAGE = 10;

// 🔒 Ported from web Feed.jsx: coerce EVERY field so a malformed post can never
// null-deref a renderer (the real crash source the web ListErrorBoundary guards).
function normalizePost(p: any): NormalizedPost | null {
  if (!p || typeof p !== "object") return null;
  const likes = Array.isArray(p.likes) ? p.likes : [];
  const commentsRaw = Array.isArray(p.comments) ? p.comments : [];
  return {
    _id:
      typeof p._id === "string" && p._id
        ? p._id
        : `tmp-${Math.random().toString(36).slice(2, 10)}`,
    author:
      p.author && typeof p.author === "object"
        ? p.author
        : { name: "Unknown", photos: [] },
    content: typeof p.content === "string" ? p.content : p.content ?? "",
    images: Array.isArray(p.images) ? p.images : [],
    likesCount: Number.isFinite(p.likesCount) ? p.likesCount : likes.length,
    commentsCount: Number.isFinite(p.commentsCount)
      ? p.commentsCount
      : commentsRaw.length,
    sharesCount: Number.isFinite(p.sharesCount)
      ? p.sharesCount
      : Array.isArray(p.shares)
      ? p.shares.length
      : 0,
    isLiked: !!p.isLiked,
    isSaved: !!p.isSaved,
    isEdited: !!p.isEdited,
    deletedForEveryone: !!p.deletedForEveryone,
    comments: commentsRaw
      .map(normalizeComment)
      .filter(Boolean) as CommentNode[],
    createdAt:
      typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
  };
}

// 🔒 Local inner boundary (web ListErrorBoundary port): one bad post can't take down
// the screen; retry remounts via resetKey. Self-contained => no ui/ErrorBoundary contract risk.
class ListErrorBoundary extends Component<
  { resetKey: number; onRetry: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(e: unknown) {
    console.error("Feed render error:", e);
  }
  componentDidUpdate(prev: Readonly<{ resetKey: number }>) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError)
      this.setState({ hasError: false });
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={st.center}>
          <Ionicons name="warning-outline" size={40} color={colors.subtext} />
          <Text style={st.emptyTitle}>Couldn't display part of the feed</Text>
          <Text style={st.emptySub}>
            A post failed to render. Your navigation is safe.
          </Text>
          <TouchableOpacity style={st.retryBtn} onPress={this.props.onRetry}>
            <Text style={st.retryTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const toast = useAlert();
  const { socket } = useSocket();
  const currentUserId = user?._id ? String(user._id) : "";

  const [posts, setPosts] = useState<NormalizedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [activePost, setActivePost] = useState<NormalizedPost | null>(null);
  const [newComment, setNewComment] = useState("");
  const [shareTarget, setShareTarget] = useState<string | null>(null);

  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  const hasMoreRef = useRef(hasMore);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  const loadingMoreRef = useRef(loadingMore);
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    if (append) {
      if (loadingMoreRef.current) return;
      setLoadingMore(true);
    } else {
      setLoading(true);
      setError("");
    }
    try {
      const res: any = await fetchFeedPosts(pageNum);
      const incoming = (res?.posts || [])
        .map(normalizePost)
        .filter(Boolean) as NormalizedPost[];
      if (append) {
        setPosts((prev) => {
          const ids = new Set(prev.map((p) => p._id));
          return [...prev, ...incoming.filter((p) => !ids.has(p._id))];
        });
      } else {
        setPosts(incoming);
      }
      setHasMore(!!res?.pagination?.hasNextPage);
      setPage(pageNum);
    } catch (err: any) {
      if (!append)
        setError(
          err?.response?.status === 429
            ? "Too many requests. Please wait a moment and retry."
            : "Failed to load feed"
        );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed(1);
  }, [loadFeed]);

  // 🔒 Live updates (web parity). Every payload is shape-validated before mutation so a
  // rogue/compromised socket message can't crash or poison the list (counts finite & >=0).
  useEffect(() => {
    if (!socket) return;
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const onLikes = ({ postId, likesCount }: any) => {
      const c = num(likesCount);
      if (!c || !isObjectId(postId)) return;
      setPosts((p) =>
        p.map((x) => (x._id === postId ? { ...x, likesCount: c } : x))
      );
    };
    const onComments = ({ postId, commentsCount }: any) => {
      const c = num(commentsCount);
      if (!c || !isObjectId(postId)) return;
      setPosts((p) =>
        p.map((x) => (x._id === postId ? { ...x, commentsCount: c } : x))
      );
    };
    const onShares = ({ postId, sharesCount }: any) => {
      const c = num(sharesCount);
      if (!c || !isObjectId(postId)) return;
      setPosts((p) =>
        p.map((x) => (x._id === postId ? { ...x, sharesCount: c } : x))
      );
    };
    const onNew = ({ post }: any) => {
      const np = normalizePost(post);
      if (!np) return;
      setPosts((p) => (p.some((x) => x._id === np._id) ? p : [np, ...p]));
    };
    const onDel = ({ postId }: any) => {
      if (!isObjectId(postId)) return;
      setPosts((p) => p.filter((x) => x._id !== postId));
    };
    socket.on("post_likes_updated", onLikes);
    socket.on("post_comments_updated", onComments);
    socket.on("post_shares_updated", onShares);
    socket.on("new_post", onNew);
    socket.on("post_deleted", onDel);
    return () => {
      socket.off("post_likes_updated", onLikes);
      socket.off("post_comments_updated", onComments);
      socket.off("post_shares_updated", onShares);
      socket.off("new_post", onNew);
      socket.off("post_deleted", onDel);
    };
  }, [socket]);

  const handleToggleLike = useCallback(
    (postId: string) => {
      if (!isObjectId(postId)) return;
      let becameLiked = false;
      setPosts((prev) =>
        prev.map((p) => {
          if (p._id !== postId) return p;
          becameLiked = !p.isLiked;
          return {
            ...p,
            isLiked: becameLiked,
            likesCount: Math.max(0, p.likesCount + (becameLiked ? 1 : -1)),
          };
        })
      );
      togglePostLike(postId).catch(() => {
        // revert on failure (the old code swallowed this and left the UI desynced)
        setPosts((prev) =>
          prev.map((p) =>
            p._id === postId
              ? {
                  ...p,
                  isLiked: !becameLiked,
                  likesCount: Math.max(
                    0,
                    p.likesCount + (becameLiked ? -1 : 1)
                  ),
                }
              : p
          )
        );
        toast.error("Couldn't update like");
      });
    },
    [toast]
  );

  const handleAddComment = useCallback(async () => {
    const text = cleanText(newComment, MAX_COMMENT_LEN);
    if (!text || !activePost) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: CommentNode = {
      _id: tempId,
      author: {
        _id: currentUserId || undefined,
        name: user?.name || "You",
        photos: (user as any)?.photos,
      },
      content: text,
      createdAt: new Date().toISOString(),
      reactionSummary: [],
      repliesCount: 0,
      isDeleted: false,
      isEdited: false,
      isMine: true,
    };
    const pid = activePost._id;
    setPosts((prev) =>
      prev.map((p) =>
        p._id === pid
          ? {
              ...p,
              comments: [...p.comments, optimistic],
              commentsCount: p.commentsCount + 1,
            }
          : p
      )
    );
    setActivePost((ap) =>
      ap && ap._id === pid
        ? {
            ...ap,
            comments: [...ap.comments, optimistic],
            commentsCount: ap.commentsCount + 1,
          }
        : ap
    );
    setNewComment("");
    try {
      await addPostComment(pid, text);
    } catch {
      setPosts((prev) =>
        prev.map((p) =>
          p._id === pid
            ? {
                ...p,
                comments: p.comments.filter((c) => c._id !== tempId),
                commentsCount: Math.max(0, p.commentsCount - 1),
              }
            : p
        )
      );
      setActivePost((ap) =>
        ap && ap._id === pid
          ? {
              ...ap,
              comments: ap.comments.filter((c) => c._id !== tempId),
              commentsCount: Math.max(0, ap.commentsCount - 1),
            }
          : ap
      );
      toast.error("Failed to post comment");
    }
  }, [newComment, activePost, currentUserId, user, toast]);

  const handleCommentDeleted = useCallback(
    (postId: string, commentId: string) => {
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? {
                ...p,
                comments: p.comments.filter((c) => c._id !== commentId),
                commentsCount: Math.max(0, p.commentsCount - 1),
              }
            : p
        )
      );
      setActivePost((ap) =>
        ap && ap._id === postId
          ? {
              ...ap,
              comments: ap.comments.filter((c) => c._id !== commentId),
              commentsCount: Math.max(0, ap.commentsCount - 1),
            }
          : ap
      );
    },
    []
  );

  const onAuthorPress = useCallback(
    (userId: string) => {
      if (isObjectId(userId)) navigation.navigate("UserProfile", { userId });
    },
    [navigation]
  );
  const loadMore = useCallback(() => {
    if (!loadingMoreRef.current && hasMoreRef.current)
      void loadFeed(pageRef.current + 1, true);
  }, [loadFeed]);
  const handleRetry = useCallback(() => {
    setResetKey((k) => k + 1);
    void loadFeed(1);
  }, [loadFeed]);

  const isInitial = loading && posts.length === 0;

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>Matrimonial Community</Text>
          <Text style={st.headerSub}>Stories, advice, and family updates</Text>
        </View>
        <TouchableOpacity
          style={st.createBtn}
          onPress={() => navigation.navigate("CreatePost")}
          accessibilityLabel="Create Post"
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isInitial ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={brand.to} />
        </View>
      ) : error && posts.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="cloud-offline-outline" size={44} color="#DC2626" />
          <Text style={st.emptyTitle}>Failed to load feed</Text>
          <Text style={st.emptySub}>{error}</Text>
          <TouchableOpacity style={st.retryBtn} onPress={handleRetry}>
            <Text style={st.retryTxt}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="file-tray-outline" size={44} color={colors.subtext} />
          <Text style={st.emptyTitle}>No posts yet</Text>
          <Text style={st.emptySub}>Be the first to share something!</Text>
        </View>
      ) : (
        <ListErrorBoundary resetKey={resetKey} onRetry={handleRetry}>
          <FlatList
            data={posts}
            keyExtractor={(it) => it._id}
            contentContainerStyle={st.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={loadingMore && page === 1}
                onRefresh={() => void loadFeed(1)}
                tintColor={brand.to}
                colors={[brand.to]}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                onToggleLike={handleToggleLike}
                onOpenComments={setActivePost}
                onAuthorPress={onAuthorPress}
                onShare={setShareTarget}
              />
            )}
            ListFooterComponent={
              !hasMore && posts.length > 0 ? (
                <Text style={st.endNote}>You've seen all posts!</Text>
              ) : loadingMore ? (
                <View style={st.moreRow}>
                  <ActivityIndicator size="small" color={brand.to} />
                </View>
              ) : null
            }
          />
        </ListErrorBoundary>
      )}

      {/* Comment sheet (top-level composer + nested thread) */}
      {activePost && (
        <View style={st.sheetBackdrop} pointerEvents="box-none">
          <View style={st.sheet}>
            <View style={st.sheetHead}>
              <Text style={st.sheetTitle}>Comments</Text>
              <TouchableOpacity
                onPress={() => setActivePost(null)}
                accessibilityLabel="Close comments"
              >
                <Ionicons name="close" size={22} color={colors.heading} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={activePost.comments}
              keyExtractor={(c) => c._id}
              contentContainerStyle={{ padding: 16, gap: 4 }}
              renderItem={({ item }) => (
                <CommentItem
                  comment={item}
                  postId={activePost._id}
                  isPostOwner={
                    !!currentUserId &&
                    String(activePost.author?._id) === currentUserId
                  }
                  onDeleted={(id) => handleCommentDeleted(activePost._id, id)}
                />
              )}
              ListEmptyComponent={
                <Text style={st.noComments}>
                  No comments yet. Start the conversation!
                </Text>
              }
            />
            <View style={st.composerRow}>
              <TextInput
                style={st.composerInput}
                placeholder="Write a comment…"
                placeholderTextColor={colors.placeholder}
                value={newComment}
                onChangeText={(v) => setNewComment(v.slice(0, MAX_COMMENT_LEN))}
                maxLength={MAX_COMMENT_LEN}
                multiline
              />
              <TouchableOpacity
                style={st.composerSend}
                onPress={handleAddComment}
                disabled={!newComment.trim()}
                accessibilityLabel="Send comment"
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {shareTarget && (
        <ShareModal postId={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: colors.heading },
  headerSub: { fontSize: 12, color: colors.subtext, marginTop: 2 },
  createBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: brand.to,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 16, gap: 14 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.heading,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13.5,
    color: colors.subtext,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: brand.to,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: radius.button,
  },
  retryTxt: { color: "#fff", fontWeight: "800" },
  endNote: {
    textAlign: "center",
    color: colors.subtext,
    fontSize: 13,
    paddingVertical: 18,
  },
  moreRow: { alignItems: "center", paddingVertical: 16 },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "78%",
    paddingBottom: 18,
  },
  sheetHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: colors.heading },
  noComments: {
    textAlign: "center",
    color: colors.subtext,
    marginTop: 24,
    fontSize: 14,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.inputFill,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.heading,
    maxHeight: 100,
  },
  composerSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.to,
    alignItems: "center",
    justifyContent: "center",
  },
});
