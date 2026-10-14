// src/screens/NotificationsScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand } from "../theme";

interface NotificationItem {
  _id: string;
  type: "like" | "match" | "message" | "view";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const SAMPLE_NOTIFICATIONS: NotificationItem[] = [
  {
    _id: "notif-1",
    type: "match",
    title: "New Match!",
    body: "You and Pooja Acharya have liked each other. Start a conversation!",
    time: "10 mins ago",
    read: false,
  },
  {
    _id: "notif-2",
    type: "like",
    title: "New Interest Received",
    body: "Sushmita Rai liked your matrimonial biodata.",
    time: "1 hour ago",
    read: false,
  },
  {
    _id: "notif-3",
    type: "message",
    title: "New Message",
    body: "Aastha Sharma sent you a message: 'Namaste! Yes, my parents also liked...'",
    time: "3 hours ago",
    read: true,
  },
  {
    _id: "notif-4",
    type: "view",
    title: "Profile Viewed",
    body: "5 verified candidates viewed your biodata today.",
    time: "Yesterday",
    read: true,
  },
];

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [notifications, setNotifications] = useState<NotificationItem[]>(SAMPLE_NOTIFICATIONS);

  const getIcon = (type: string) => {
    switch (type) {
      case "match":
        return <Ionicons name="sparkles" size={20} color="#ec4899" />;
      case "like":
        return <Ionicons name="heart" size={20} color="#8b5cf6" />;
      case "message":
        return <Ionicons name="chatbubble" size={20} color="#3b82f6" />;
      default:
        return <Ionicons name="eye" size={20} color="#10b981" />;
    }
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.heading} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={markAllAsRead}>
          <Text style={styles.markReadText}>Mark read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.itemCard, !item.read && styles.unreadCard]}
            onPress={() => {
              if (item.type === "match" || item.type === "like") {
                navigation.navigate("Matches");
              } else if (item.type === "message") {
                navigation.navigate("Messages");
              }
            }}
          >
            <View style={styles.iconCircle}>{getIcon(item.type)}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBody}>{item.body}</Text>
              <Text style={styles.itemTime}>{item.time}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
      />
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
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.heading,
  },
  markReadText: {
    fontSize: 13,
    color: brand.to,
    fontWeight: "600",
  },
  list: {
    padding: 16,
    gap: 10,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    gap: 12,
  },
  unreadCard: {
    backgroundColor: "#faf5ff",
    borderColor: "#e9d5ff",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.heading,
  },
  itemBody: {
    fontSize: 13,
    color: colors.label,
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brand.to,
    marginTop: 6,
  },
});
