// src/screens/MessagesScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius, cardShadow } from "../../theme";
import { fetchConversations, ConversationSummary } from "../../api/messages";
import { messagePreview } from "../../utils/preview";

// ✅ Secure default avatar fallback
const DEFAULT_AVATAR = require("../../../assets/default-avatar.png");

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ✅ Stable fetch function matching web app pattern
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const res = await fetchConversations();

      if (res?.success && Array.isArray(res.conversations)) {
        // Sort by lastMessageAt or createdAt descending
        const sorted = res.conversations.sort((a, b) => {
          const dateA = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setConversations(sorted);
      } else {
        setConversations([]);
      }
    } catch (err: any) {
      console.error("❌ Failed to load conversations:", err);
      setError("Unable to load conversations. Please check your connection.");
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
  };

  // ✅ Secure search filtering
  const filtered = conversations.filter((c) => {
    const userName = c.user?.name || "";
    return userName.toLowerCase().includes(search.toLowerCase());
  });

  // ✅ Secure photo URL helper with fallback
  const getPhotoUrl = (photos?: Array<{ url?: string }>) => {
    if (photos && photos.length > 0 && photos[0]?.url) {
      const url = photos[0].url;
      if (
        typeof url === "string" &&
        (url.startsWith("http://") || url.startsWith("https://"))
      ) {
        return { uri: url };
      }
    }
    return DEFAULT_AVATAR;
  };

  // ✅ Safe time formatting
  const formatTime = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  // ✅ Safe message preview generation
  const getMessagePreview = (msg: any) => {
    if (!msg) return "Start a conversation...";
    if (msg.deletedForEveryone) return "This message was deleted";

    if (msg.type === "call" || msg.callType) {
      const isVideo = msg.callType === "video" || msg.type === "video_call";
      const status = msg.callStatus || "ended";
      if (status === "missed" || status === "no-answer")
        return "📞 Missed call";
      if (status === "declined") return "📞 Declined";
      return isVideo ? "📹 Video call" : "📞 Voice call";
    }

    switch (msg.type) {
      case "image":
        return "📷 Photo";
      case "voice":
      case "audio":
        return "🎤 Voice message";
      case "sticker":
        return `${msg.text || ""} Sticker`;
      case "heart":
        return "❤️";
      case "post":
        return "📤 Shared post";
      case "gif":
        return "🎬 GIF";
      default:
        return msg.text || msg.content || "Start a conversation...";
    }
  };

  // ✅ Secure navigation handler
  const handleConversationPress = (item: ConversationSummary) => {
    if (!item?.user?._id || typeof item.user._id !== "string") {
      Alert.alert("Error", "Invalid conversation data");
      return;
    }
    navigation.navigate("ChatDetail", {
      conversation: item,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brand.from} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      </View>
    );
  }

  if (error && conversations.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={64}
            color={colors.danger}
          />
          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => navigation.navigate("Matches")}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={22} color={brand.from} />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.subtext} />
        <TextInput
          placeholder="Search conversations..."
          placeholderTextColor={colors.placeholder}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={colors.subtext} />
          </TouchableOpacity>
        ) : null}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="chatbubble-outline"
            size={64}
            color={colors.subtext}
          />
          <Text style={styles.emptyTitle}>
            {search ? "No matches found" : "No conversations yet"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {search
              ? `No conversations found for "${search}"`
              : "Match with someone to start chatting!"}
          </Text>
          {!search && (
            <TouchableOpacity
              style={styles.discoverBtn}
              onPress={() => navigation.navigate("Discover")}
              activeOpacity={0.8}
            >
              <Text style={styles.discoverBtnText}>Discover People</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={brand.from}
              colors={[brand.from]}
            />
          }
          renderItem={({ item }) => {
            const partner = item.user;
            const isUnread = (item.unreadCount || 0) > 0;

            return (
              <TouchableOpacity
                style={styles.chatRow}
                onPress={() => handleConversationPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Image
                    source={getPhotoUrl(partner.photos)}
                    style={styles.avatar}
                  />
                  {partner.isOnline && <View style={styles.onlineBadge} />}
                </View>

                <View style={styles.chatDetails}>
                  <View style={styles.chatHeader}>
                    <Text
                      style={[
                        styles.partnerName,
                        isUnread && styles.unreadName,
                      ]}
                      numberOfLines={1}
                    >
                      {partner.name || "Unknown User"}
                    </Text>
                    <Text style={styles.chatTime}>
                      {formatTime(item.lastMessageAt || item.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.chatFooter}>
                    <Text
                      style={[
                        styles.lastMsgText,
                        isUnread ? styles.unreadText : null,
                      ]}
                      numberOfLines={1}
                    >
                      {messagePreview(item.lastMessage)}
                    </Text>

                    {isUnread && (
                      <View style={styles.unreadBubble}>
                        <Text style={styles.unreadBubbleText}>
                          {item.unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.pageBg,
  },
  center: {
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
  },
  errorSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 4,
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    backgroundColor: brand.from,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.button,
  },
  retryBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.heading,
  },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.heading,
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    ...cardShadow,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.inputFill,
  },
  onlineBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#10b981",
    borderWidth: 2,
    borderColor: colors.card,
  },
  chatDetails: {
    flex: 1,
    minWidth: 0,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  partnerName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
    flex: 1,
  },
  unreadName: {
    fontWeight: "800",
  },
  chatTime: {
    fontSize: 11,
    color: colors.subtext,
    marginLeft: 8,
  },
  chatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  lastMsgText: {
    fontSize: 13.5,
    color: colors.subtext,
    flex: 1,
  },
  unreadText: {
    fontWeight: "700",
    color: colors.heading,
  },
  unreadBubble: {
    backgroundColor: brand.from,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  unreadBubbleText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "800",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  discoverBtn: {
    marginTop: 24,
    backgroundColor: brand.from,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radius.button,
  },
  discoverBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
});
