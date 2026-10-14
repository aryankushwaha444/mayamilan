// src/screens/MessagesScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../theme";
import { fetchConversations, ConversationSummary } from "../api/messages";

const SAMPLE_CONVERSATIONS: ConversationSummary[] = [
  {
    _id: "conv-1",
    participants: [
      {
        _id: "u-1",
        name: "Aastha Sharma",
        isOnline: true,
        photos: [
          { url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500" },
        ],
      },
    ],
    lastMessage: {
      _id: "m-1",
      conversationId: "conv-1",
      sender: { _id: "u-1", name: "Aastha Sharma" },
      content: "Namaste! Yes, my parents also liked your biodata.",
      createdAt: "10:24 AM",
    },
    unreadCount: 2,
    updatedAt: "10:24 AM",
  },
  {
    _id: "conv-2",
    participants: [
      {
        _id: "u-2",
        name: "Prabesh Shrestha",
        isOnline: false,
        lastSeen: "20m ago",
        photos: [
          { url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500" },
        ],
      },
    ],
    lastMessage: {
      _id: "m-2",
      conversationId: "conv-2",
      sender: { _id: "me", name: "You" },
      content: "Sounds great! Let's arrange a family meet this Saturday.",
      createdAt: "Yesterday",
    },
    unreadCount: 0,
    updatedAt: "Yesterday",
  },
  {
    _id: "conv-3",
    participants: [
      {
        _id: "u-3",
        name: "Sneha Thapa",
        isOnline: true,
        photos: [
          { url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500" },
        ],
      },
    ],
    lastMessage: {
      _id: "m-3",
      conversationId: "conv-3",
      sender: { _id: "u-3", name: "Sneha Thapa" },
      content: "Are you free for a quick audio call later this evening?",
      createdAt: "Oct 12",
    },
    unreadCount: 1,
    updatedAt: "Oct 12",
  },
];

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConversations() {
      try {
        const res = await fetchConversations();
        setConversations(res?.conversations?.length ? res.conversations : SAMPLE_CONVERSATIONS);
      } catch {
        setConversations(SAMPLE_CONVERSATIONS);
      } finally {
        setLoading(false);
      }
    }
    loadConversations();
  }, []);

  const filtered = conversations.filter((c) => {
    const otherUser = c.participants[0];
    return otherUser?.name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => navigation.navigate("Matches")}
        >
          <Ionicons name="create-outline" size={22} color={brand.to} />
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brand.to} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const partner = item.participants[0] || { name: "User" };
            return (
              <TouchableOpacity
                style={styles.chatRow}
                onPress={() =>
                  navigation.navigate("ChatDetail", {
                    conversation: item,
                  })
                }
              >
                <View style={styles.avatarWrap}>
                  <Image
                    source={{
                      uri:
                        partner.photos?.[0]?.url ||
                        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
                    }}
                    style={styles.avatar}
                  />
                  {partner.isOnline && <View style={styles.onlineBadge} />}
                </View>

                <View style={styles.chatDetails}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.partnerName}>{partner.name}</Text>
                    <Text style={styles.chatTime}>
                      {item.lastMessage?.createdAt || item.updatedAt}
                    </Text>
                  </View>

                  <View style={styles.chatFooter}>
                    <Text
                      style={[
                        styles.lastMsgText,
                        item.unreadCount ? styles.unreadText : null,
                      ]}
                      numberOfLines={1}
                    >
                      {item.lastMessage?.content || "Start conversation..."}
                    </Text>

                    {!!item.unreadCount && (
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ffffff",
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
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 8,
    gap: 12,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
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
    borderColor: "#ffffff",
  },
  chatDetails: {
    flex: 1,
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
  },
  chatTime: {
    fontSize: 11,
    color: colors.subtext,
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
    backgroundColor: brand.to,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  unreadBubbleText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
