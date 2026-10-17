// src/components/feed/CommentItem.tsx
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  type ViewStyle, // ← needed by the extracted replyIndent helper
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { colors, brand } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { ConfirmDialog } from "../ui";
import {
  CommentNode,
  Reaction,
  ALLOWED_EMOJIS,
  MAX_REPLY_LEN,
  MAX_REPLY_DEPTH,
  authorAvatar,
  formatRelativeTime,
  cleanText,
  normalizeComment,
} from "./types";
import {
  toggleReaction,
  getReplies,
  addReply,
  deleteComment,
} from "../../api/postComments";
import { isObjectId } from "../../utils/media";

interface Props {
  comment: CommentNode;
  postId: string;
  isPostOwner?: boolean;
  isReply?: boolean;
  depth?: number;
  onDeleted?: (id: string) => void;
}

function CommentItemInner({
  comment,
  postId,
  isPostOwner = false,
  isReply = false,
  depth = 0,
  onDeleted,
}: Props) {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const toast = useAlert();
  const currentUserId = user?._id ? String(user._id) : "";

  const [showPicker, setShowPicker] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>(
    comment.reactionSummary || []
  );
  const [reacting, setReacting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replies, setReplies] = useState<CommentNode[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [repliesCount, setRepliesCount] = useState(comment.repliesCount || 0);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const repliesRef = useRef(replies);
  useEffect(() => {
    repliesRef.current = replies;
  }, [replies]);

  const authorId = comment.author?._id ? String(comment.author._id) : "";
  const authorName = comment.author?.name || "Deleted User";
  const isMine =
    comment.isMine || (!!currentUserId && authorId === currentUserId);
  const canDelete = isMine || isPostOwner;
  const canReply = !isReply && depth < MAX_REPLY_DEPTH;

  const openAuthor = useCallback(() => {
    if (isObjectId(authorId))
      navigation.navigate("UserProfile", { userId: authorId });
  }, [authorId, navigation]);

  // Optimistic reaction toggle, reverted on error (web parity). Emoji comes from the
  // SERVER enum list => a pick can never 400 on enum validation.
  const handleReact = useCallback(
    async (emoji: string) => {
      setShowPicker(false);
      if (reacting) return;
      const prev = reactions;
      const existing = prev.find((r) => r.emoji === emoji);
      let next: Reaction[];
      if (existing) {
        next = existing.reactedByMe
          ? existing.count === 1
            ? prev.filter((r) => r.emoji !== emoji)
            : prev.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count - 1, reactedByMe: false }
                  : r
              )
          : prev.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, reactedByMe: true }
                : r
            );
      } else {
        next = [...prev, { emoji, count: 1, reactedByMe: true }];
      }
      setReactions(next);
      setReacting(true);
      try {
        const res = await toggleReaction(comment._id, emoji);
        setReactions(res.reactionSummary);
      } catch {
        setReactions(prev); // revert
        toast.error("Failed to react");
      } finally {
        setReacting(false);
      }
    },
    [reactions, reacting, comment._id, toast]
  );

  const toggleReplies = useCallback(async () => {
    if (!showReplies && replies.length === 0) {
      setLoadingReplies(true);
      try {
        const res = await getReplies(postId, comment._id);
        setReplies(
          (res.replies || [])
            .map(normalizeComment)
            .filter(Boolean) as CommentNode[]
        );
      } catch {
        toast.error("Failed to load replies");
      }
      setLoadingReplies(false);
    }
    setShowReplies((v) => !v);
  }, [showReplies, replies.length, postId, comment._id, toast]);

  const submitReply = useCallback(async () => {
    const text = cleanText(replyText, MAX_REPLY_LEN);
    if (!text) return;
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
      parent: comment._id,
      isMine: true,
    };
    setReplies((p) => [...p, optimistic]);
    setRepliesCount((c) => c + 1);
    setShowReplies(true);
    setReplyText("");
    setReplying(false);
    try {
      const res = await addReply(postId, comment._id, text);
      const real = normalizeComment(res.reply);
      setReplies((p) =>
        p.map((r) => (r._id === tempId ? real || optimistic : r))
      );
      if (Number.isFinite(res.repliesCount)) setRepliesCount(res.repliesCount);
      toast.success("Reply added");
    } catch {
      setReplies((p) => p.filter((r) => r._id !== tempId)); // revert
      setRepliesCount((c) => Math.max(0, c - 1));
      toast.error("Failed to post reply");
    }
  }, [replyText, currentUserId, user, comment._id, postId, toast]);

  const doDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteComment(postId, comment._id);
      onDeleted?.(comment._id);
      toast.success("Comment deleted");
    } catch {
      toast.error("Failed to delete comment");
    }
  }, [postId, comment._id, onDeleted, toast]);

  if (comment.isDeleted) {
    return (
      <View style={[st.item, isReply && replyIndent(depth)]}>
        <Text style={st.tombstone}>Comment removed</Text>
      </View>
    );
  }

  return (
    <View
      style={[st.item, isReply && replyIndent(depth)]}
      accessibilityLabel={`Comment by ${authorName}`}
    >
      <TouchableOpacity
        onPress={openAuthor}
        disabled={!isObjectId(authorId)}
        hitSlop={6}
      >
        <Ionicons
          source={undefined as any}
          name="person-circle-outline"
          size={34}
          color={colors.subtext}
          style={st.avatarFallbackIcon}
        />
      </TouchableOpacity>

      <View style={st.thread}>
        <View style={st.bubble}>
          <View style={st.head}>
            <TouchableOpacity
              onPress={openAuthor}
              disabled={!isObjectId(authorId)}
            >
              <Text style={st.name}>{authorName}</Text>
            </TouchableOpacity>
            <Text style={st.time}>
              {formatRelativeTime(comment.createdAt)}
              {comment.isEdited ? " · edited" : ""}
            </Text>
          </View>
          <Text style={st.body}>{comment.content}</Text>

          {reactions.length > 0 && (
            // was accessibilityRole="group" (ARIA-only, not in RN's union) ->
            // plain labeled container; the chips inside remain real buttons.
            <View style={st.chips} accessibilityLabel="Reactions">
              {reactions.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[st.chip, r.reactedByMe && st.chipMine]}
                  onPress={() => handleReact(r.emoji)}
                  disabled={reacting}
                  accessibilityRole="button"
                  accessibilityState={{ selected: r.reactedByMe }}
                >
                  <Text style={st.chipEmoji}>{r.emoji}</Text>
                  <Text style={st.chipCount}>{r.count}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={st.actions} accessibilityRole="toolbar">
          <TouchableOpacity
            onPress={() => setShowPicker((v) => !v)}
            disabled={reacting}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPicker }}
          >
            <Text style={st.action}>😊 React</Text>
          </TouchableOpacity>
          {canReply && (
            <TouchableOpacity
              onPress={() => setReplying((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={st.action}>Reply</Text>
            </TouchableOpacity>
          )}
          {!isReply && repliesCount > 0 && (
            <TouchableOpacity
              onPress={toggleReplies}
              disabled={loadingReplies}
              accessibilityRole="button"
            >
              <Text style={st.action}>
                {loadingReplies
                  ? "Loading…"
                  : showReplies
                  ? "Hide replies"
                  : `View ${repliesCount} ${
                      repliesCount === 1 ? "reply" : "replies"
                    }`}
              </Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity
              onPress={() => setConfirmDelete(true)}
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
            >
              <Text style={[st.action, st.danger]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {showPicker && (
          // was "listbox"/"option" (ARIA-only) -> RN-native "menu"/"menuitem",
          // which ARE in AccessibilityRole and give correct popover semantics.
          <View style={st.picker} accessibilityRole="menu">
            {ALLOWED_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                onPress={() => handleReact(e)}
                disabled={reacting}
                accessibilityRole="menuitem"
                accessibilityLabel={`React with ${e}`}
              >
                <Text style={st.pickerEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {replying && (
          <View style={st.replyForm}>
            <TextInput
              style={st.replyInput}
              placeholder={`Reply to ${authorName}…`}
              placeholderTextColor={colors.placeholder}
              value={replyText}
              onChangeText={(v) => setReplyText(v.slice(0, MAX_REPLY_LEN))}
              maxLength={MAX_REPLY_LEN}
              multiline
            />
            <TouchableOpacity
              onPress={submitReply}
              disabled={!replyText.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
            >
              <Ionicons
                name="send"
                size={18}
                color={replyText.trim() ? brand.from : colors.placeholder}
              />
            </TouchableOpacity>
          </View>
        )}

        {showReplies && (
          <View style={st.replies}>
            {loadingReplies ? (
              <Text style={st.muted}>Loading replies…</Text>
            ) : replies.length > 0 ? (
              replies.map((r) => (
                <CommentItem
                  key={r._id}
                  comment={r}
                  postId={postId}
                  isReply
                  depth={depth + 1}
                  isPostOwner={isPostOwner}
                  onDeleted={(id) => {
                    setReplies((p) => p.filter((x) => x._id !== id));
                    setRepliesCount((c) => Math.max(0, c - 1));
                  }}
                />
              ))
            ) : (
              <Text style={st.muted}>No replies found.</Text>
            )}
          </View>
        )}
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this comment?"
        message="This comment will be permanently removed. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}

const CommentItem = memo(CommentItemInner);
export default CommentItem;

// ✅ Extracted OUT of StyleSheet.create: a function value cannot live in a
//    registered stylesheet (its keys are typed ViewStyle|TextStyle|ImageStyle,
//    i.e. non-callable). As a plain helper it returns a real ViewStyle.
const replyIndent = (d: number): ViewStyle => ({
  marginLeft: Math.min(d * 12, 36),
});

const st = StyleSheet.create({
  item: { flexDirection: "row", gap: 8, marginBottom: 10 },
  // replyIndent REMOVED from here (was the source of TS2349 x2 + TS2322)
  avatarFallbackIcon: { width: 34, height: 34 },
  thread: { flex: 1, minWidth: 0 },
  bubble: {
    backgroundColor: colors.inputFill,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  name: { fontSize: 13, fontWeight: "800", color: colors.heading },
  time: { fontSize: 11, color: colors.subtext },
  body: { fontSize: 13.5, color: colors.heading, marginTop: 2, lineHeight: 19 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  chipMine: {
    borderColor: brand.from,
    backgroundColor: "rgba(225,29,116,0.08)",
  },
  chipEmoji: { fontSize: 13 },
  chipCount: { fontSize: 11, fontWeight: "700", color: colors.subtext },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  action: { fontSize: 12, fontWeight: "700", color: colors.subtext },
  danger: { color: colors.danger },
  picker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    padding: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  pickerEmoji: { fontSize: 22, padding: 4 },
  replyForm: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.heading,
    maxHeight: 90,
  },
  replies: { marginTop: 8, paddingLeft: 4 },
  muted: { fontSize: 12, color: colors.subtext },
  tombstone: { fontSize: 12.5, color: colors.subtext, fontStyle: "italic" },
});
