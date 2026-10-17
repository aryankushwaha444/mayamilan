// src/screens/chat/ChatDetailScreen.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, brand } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useCallContext } from "../../context/CallContext";

// ✅ Import from the BARREL, not the empty stub components/chat/ChatInputBar.tsx.
//    The barrel re-exports ChatInputBar from the FLAT live file and pulls in the
//    extracted MessageBubble (which renders voice/heart/gif/sticker via VoiceBubble).
import {
  MessageBubble,
  DateSeparator,
  PhotoLightbox,
  ChatInputBar,
} from "../../components/chat";
import type { SendPayload } from "../../components/chat";

// ✅ Pure helpers + the security gate. These are the SAME modules MessageBubble /
//    VoiceBubble / CallRow already import, so this adds no new dependency class.
import { formatTime, formatDateSeparator } from "../../utils/date";
import { isSafeMediaUrl, isObjectId } from "../../utils/media";

import { uploadChatAttachment } from "../../api/messages";
import {
  fetchMessages,
  sendChatMessage,
  deleteMessage,
  ChatMessage,
  ConversationSummary,
} from "../../api/messages";
import { getUserProfile } from "../../api/user";

// depth-2 file (src/screens/chat/) -> 3 hops to reach Mobile/assets
const DEFAULT_AVATAR = require("../../../assets/default-avatar.png");

interface MessageGroup {
  date: string;
  messages: ChatMessage[];
}

const DELETE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h "delete for everyone" (UX mirror; server enforces)
const MAX_TEXT_LENGTH = 2000;

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user: currentUser } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const { startCall: beginCall } = useCallContext();

  // ---- Attacker-controlled surface #1: route.params (deep link / any caller) ----
  // Validate the conversation id as a real ObjectId BEFORE it ever reaches the API.
  const rawConversationId = route.params?.conversation?._id;
  const conversationId: string | undefined = isObjectId(rawConversationId)
    ? rawConversationId
    : undefined;
  const conversation = route.params?.conversation as
    | ConversationSummary
    | undefined;

  const currentUserId: string =
    currentUser?._id ||
    (isObjectId(route.params?.currentUserId) ? route.params.currentUserId : "");

  // Support both navigation shapes: { user } and { participants: [] }
  const conversationAny = conversation as any;
  const partnerFromParticipants: any = Array.isArray(
    conversationAny?.participants
  )
    ? conversationAny.participants.find(
        (p: any) => p?._id && p._id !== currentUserId
      )
    : undefined;
  const partner: any =
    conversation?.user ||
    partnerFromParticipants ||
    route.params?.partner ||
    route.params?.otherUser ||
    null;

  // ---- Attacker-controlled surface #2: partner/user id from params ----
  const rawPartnerId = partner?._id || route.params?.userId;
  const partnerId: string | undefined = isObjectId(rawPartnerId)
    ? rawPartnerId
    : undefined;

  // Fallback: fetch real name/photo from DB if missing (only with a validated id)
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    if (partnerId && (!partner?.name || !partner?.photos?.length)) {
      getUserProfile(partnerId)
        .then((d: any) => {
          if (!cancelled && d?.user) setPartnerProfile(d.user);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  const displayPartner: any = partnerProfile || partner || {};

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(
    null
  );
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const getPartnerName = (): string => {
    const name = displayPartner?.name;
    return typeof name === "string" && name.trim().length > 0
      ? name
      : "Unknown User";
  };

  // ✅ SECURITY: was startsWith("http") (accepted cleartext + ANY host, incl. the
  //    casino-PWA unsplash vector). Now https + host allowlist, else bundled avatar.
  const safePhotoSource = (photos?: Array<{ url?: string }>) => {
    const url = photos?.[0]?.url;
    return isSafeMediaUrl(url) ? { uri: url as string } : DEFAULT_AVATAR;
  };

  const openLightbox = useCallback((url: string) => {
    if (isSafeMediaUrl(url)) setLightboxUrl(url); // never open an off-allowlist URL
  }, []);

  const loadMessages = useCallback(
    async (pageNum = 1, append = false) => {
      if (!conversationId) {
        setLoading(false);
        return;
      }
      try {
        if (pageNum === 1 && !append) setLoading(true);
        const res = await fetchMessages(conversationId, pageNum);
        if (res?.messages && Array.isArray(res.messages)) {
          setMessages((prev) =>
            append ? [...res.messages, ...prev] : res.messages
          );
          setHasMore(res.messages.length === 50);
          setPage(pageNum);
        }
      } catch {
        // Generic copy only — never leak server error text (enumeration / internals).
        Alert.alert(
          "Error",
          "Failed to load messages. Please check your connection."
        );
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    loadMessages(1, false);
  }, [loadMessages]);

  const handleSendPayload = useCallback(
    async (payload: SendPayload) => {
      if (!conversationId) throw new Error("No conversation");
      setSending(true);
      try {
        if (payload.type === "text") {
          const text = (payload.text || "").trim();
          if (!text) return;
          if (text.length > MAX_TEXT_LENGTH)
            throw new Error("Message too long");
          await sendChatMessage(conversationId, text, "text");
        } else if (payload.type === "heart") {
          await sendChatMessage(conversationId, "", "heart");
        } else if (payload.type === "sticker") {
          await sendChatMessage(conversationId, payload.text || "", "sticker");
        } else if (payload.type === "gif") {
          // Gate the GIF url too — a tampered payload must not smuggle an off-host URL.
          if (
            !payload.attachment?.url ||
            !isSafeMediaUrl(payload.attachment.url)
          )
            throw new Error("Invalid GIF");
          await sendChatMessage(conversationId, "", "gif", payload.attachment);
        } else if (payload.type === "image" || payload.type === "voice") {
          if (!payload.fileUri) throw new Error("Missing file");
          const up = await uploadChatAttachment(
            conversationId,
            payload.fileUri,
            payload.mimeType ||
              (payload.type === "image" ? "image/jpeg" : "audio/mp4"),
            payload.fileName || `${payload.type}-${Date.now()}`
          );
          if (!up?.attachment?.url) throw new Error("Upload failed");
          await sendChatMessage(
            conversationId,
            "",
            payload.type,
            up.attachment
          );
        }
        await loadMessages(1, false); // refresh so ticks/timestamps come from DB
      } finally {
        setSending(false);
      }
    },
    [conversationId, loadMessages]
  );

  const handleDeleteMessage = async (
    message: ChatMessage,
    scope: "me" | "everyone"
  ) => {
    try {
      if (scope === "everyone") {
        // UX-only check; backend enforces the real 2-hour rule.
        if (
          new Date(message.createdAt).getTime() <
          Date.now() - DELETE_WINDOW_MS
        ) {
          Alert.alert(
            "Cannot Delete",
            "Messages can only be deleted for everyone within 2 hours."
          );
          return;
        }
      }
      await deleteMessage(message._id, scope);
      setMessages((prev) => prev.filter((m) => m._id !== message._id));
      setShowActionMenu(false);
      setSelectedMessage(null);
    } catch {
      Alert.alert("Error", "Failed to delete message. Please try again.");
    }
  };

  const handleLongPress = useCallback((message: ChatMessage, event: any) => {
    setSelectedMessage(message);
    const { pageX, pageY } = event.nativeEvent;
    setMenuPosition({ x: pageX, y: pageY });
    setShowActionMenu(true);
  }, []);

  const canDeleteForEveryone = (message: ChatMessage): boolean =>
    new Date(message.createdAt).getTime() >= Date.now() - DELETE_WINDOW_MS;

  // Group oldest -> newest
  const groupedMessages: MessageGroup[] = useMemo(() => {
    const groups: MessageGroup[] = [];
    let currentDate = "";
    messages.forEach((msg) => {
      const date = formatDateSeparator(msg.createdAt);
      if (date !== currentDate) {
        currentDate = date;
        groups.push({ date, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });
    return groups;
  }, [messages]);

  // Reverse group order for the INVERTED list so newest sits at the visible bottom.
  const invertedData = useMemo(
    () => [...groupedMessages].reverse(),
    [groupedMessages]
  );

  // ✅ Was a dead Alert stub. The "Call" route is registered in the single stack now,
  //    so navigate there with the (already validated) partner + conversation id.
  const startCall = (isVideo: boolean = false) => {
    if (!partnerId) {
      Alert.alert("Call unavailable", "No valid user selected.");
      return;
    }

    void beginCall(
      partnerId,
      isVideo ? "video" : "audio",
      conversationId && isObjectId(conversationId) ? conversationId : undefined
    );
  };

  if (loading && messages.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={brand.from} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingTop: insets.top }]}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.heading} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.profileSection}
          onPress={() => {
            // partnerId is already ObjectId-validated above; safe to pass as a param.
            if (partnerId)
              navigation.navigate("UserProfile", { userId: partnerId });
          }}
          activeOpacity={0.7}
        >
          <Image
            source={safePhotoSource(displayPartner?.photos)}
            style={styles.avatar}
          />
          <View style={styles.partnerInfo}>
            <Text style={styles.partnerName} numberOfLines={1}>
              {getPartnerName()}
            </Text>
            <Text style={styles.onlineStatus} numberOfLines={1}>
              {displayPartner?.isOnline ? "Active now" : "Active recently"}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.callActions}>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => startCall(false)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="call" size={20} color={brand.from} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => startCall(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="videocam" size={21} color={brand.from} />
          </TouchableOpacity>
        </View>
      </View>

      {/* INVERTED LIST: newest message always visible at the bottom. */}
      <FlatList
        ref={flatListRef}
        inverted
        data={invertedData}
        keyExtractor={(item) => `group-${item.date}`}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (hasMore && !loading) loadMessages(page + 1, true);
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={5}
        renderItem={({ item: group }) => (
          <View>
            <DateSeparator label={group.date} />
            {group.messages.map((msg: ChatMessage) => (
              <MessageBubble
                key={msg._id}
                item={msg}
                isMe={msg.sender._id === currentUserId}
                onLongPress={handleLongPress}
                onImagePress={openLightbox}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="chatbubble-outline"
                size={64}
                color={colors.subtext}
              />
              <Text style={styles.emptyText}>No messages yet</Text>
            </View>
          ) : null
        }
      />

      <ChatInputBar
        onSend={handleSendPayload}
        disabled={sending}
        bottomInset={Math.max(insets.bottom, 12)}
      />

      {/* ✅ Fullscreen image/GIF viewer (web PhotoLightbox parity). URL pre-validated. */}
      <PhotoLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowActionMenu(false);
          setSelectedMessage(null);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowActionMenu(false);
            setSelectedMessage(null);
          }}
        >
          <View
            style={[
              styles.actionMenu,
              { top: Math.max(menuPosition.y - 100, insets.top + 60) },
            ]}
          >
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                Alert.alert("React", "Coming soon!");
                setShowActionMenu(false);
              }}
            >
              <Ionicons name="happy-outline" size={20} color={colors.heading} />
              <Text style={styles.actionMenuText}>React</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                Alert.alert("Reply", "Coming soon!");
                setShowActionMenu(false);
              }}
            >
              <Ionicons
                name="return-up-back-outline"
                size={20}
                color={colors.heading}
              />
              <Text style={styles.actionMenuText}>Reply</Text>
            </TouchableOpacity>
            {selectedMessage && (
              <TouchableOpacity
                style={styles.actionMenuItem}
                onPress={() => handleDeleteMessage(selectedMessage, "me")}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={colors.danger}
                />
                <Text style={[styles.actionMenuText, { color: colors.danger }]}>
                  Delete for me
                </Text>
              </TouchableOpacity>
            )}
            {selectedMessage &&
              selectedMessage.sender._id === currentUserId &&
              canDeleteForEveryone(selectedMessage) && (
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() =>
                    handleDeleteMessage(selectedMessage, "everyone")
                  }
                >
                  <Ionicons name="trash" size={20} color={colors.danger} />
                  <Text
                    style={[styles.actionMenuText, { color: colors.danger }]}
                  >
                    Delete for everyone
                  </Text>
                </TouchableOpacity>
              )}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  centerContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.subtext, marginTop: 12, fontSize: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
    gap: 12,
  },
  backBtn: { padding: 4 },
  profileSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.inputFill,
  },
  partnerInfo: { flex: 1 },
  partnerName: { fontSize: 16, fontWeight: "700", color: colors.heading },
  onlineStatus: { fontSize: 11, color: "#10b981", fontWeight: "600" },
  callActions: { flexDirection: "row", gap: 8 },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesList: {
    padding: 16,
    gap: 4,
    justifyContent: "flex-end",
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
    marginTop: 12,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  actionMenu: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  actionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  actionMenuText: { fontSize: 15, fontWeight: "600", color: colors.heading },
});
