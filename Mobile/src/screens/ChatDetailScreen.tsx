// src/screens/ChatDetailScreen.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { colors, brand } from "../theme";
import { fetchMessages, sendChatMessage, ChatMessage } from "../api/messages";

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    _id: "msg-1",
    conversationId: "conv-1",
    sender: { _id: "other", name: "Candidate" },
    content: "Namaste! Thank you for connecting with me on MayaMilan.",
    createdAt: "10:15 AM",
  },
  {
    _id: "msg-2",
    conversationId: "conv-1",
    sender: { _id: "me", name: "Me" },
    content: "Namaste! Very pleased to connect. I saw your biodata and we seem to have very compatible family values.",
    createdAt: "10:18 AM",
  },
  {
    _id: "msg-3",
    conversationId: "conv-1",
    sender: { _id: "other", name: "Candidate" },
    content: "Yes, exactly! My parents were asking about your profession and whether you live in Kathmandu?",
    createdAt: "10:20 AM",
  },
];

export default function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const conversation = route.params?.conversation;
  const partner = conversation?.participants?.[0] || {
    name: "Aastha Sharma",
    photos: [{ url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500" }],
    isOnline: true,
  };

  const [messages, setMessages] = useState<ChatMessage[]>(DEFAULT_MESSAGES);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    async function loadChat() {
      if (conversation?._id) {
        try {
          const res = await fetchMessages(conversation._id);
          if (res?.messages?.length) {
            setMessages(res.messages);
          }
        } catch {}
      }
    }
    loadChat();
  }, [conversation?._id]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const newMsg: ChatMessage = {
      _id: "msg-" + Date.now(),
      conversationId: conversation?._id || "conv-1",
      sender: { _id: "me", name: "Me" },
      content: inputText.trim(),
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMsg]);
    const textToSend = inputText.trim();
    setInputText("");

    try {
      if (conversation?._id) {
        await sendChatMessage(conversation._id, textToSend);
      }
    } catch {}

    // Auto simulated respectful reply
    setTimeout(() => {
      const autoReply: ChatMessage = {
        _id: "msg-reply-" + Date.now(),
        conversationId: conversation?._id || "conv-1",
        sender: { _id: "other", name: partner.name },
        content: "That sounds wonderful! Looking forward to having our families speak as well.",
        createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, autoReply]);
    }, 1500);
  };

  const startCall = (isVideo = false) => {
    navigation.navigate("Call", {
      partner,
      isVideo,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Chat Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.heading} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.profileSection}
          onPress={() => navigation.navigate("UserProfile", { candidate: partner })}
        >
          <Image
            source={{
              uri:
                partner.photos?.[0]?.url ||
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
            }}
            style={styles.avatar}
          />
          <View>
            <Text style={styles.partnerName}>{partner.name}</Text>
            <Text style={styles.onlineStatus}>
              {partner.isOnline ? "Online • Active Now" : "Active recently"}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.callActions}>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => startCall(false)}
            accessibilityLabel="Audio Call"
          >
            <Ionicons name="call" size={20} color={brand.to} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => startCall(true)}
            accessibilityLabel="Video Call"
          >
            <Ionicons name="videocam" size={21} color={brand.from} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMe = item.sender._id === "me";
          return (
            <View
              style={[
                styles.bubbleWrapper,
                isMe ? styles.bubbleMeWrapper : styles.bubbleOtherWrapper,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  isMe ? styles.bubbleMe : styles.bubbleOther,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isMe ? styles.messageTextMe : styles.messageTextOther,
                  ]}
                >
                  {item.content}
                </Text>
                <Text
                  style={[
                    styles.timeText,
                    isMe ? styles.timeTextMe : styles.timeTextOther,
                  ]}
                >
                  {item.createdAt}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.attachBtn}>
          <Ionicons name="image-outline" size={22} color={colors.subtext} />
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={colors.placeholder}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        <TouchableOpacity
          style={[
            styles.sendBtn,
            inputText.trim() ? styles.sendBtnActive : null,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Ionicons
            name="send"
            size={18}
            color={inputText.trim() ? "#ffffff" : colors.placeholder}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
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
  },
  partnerName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
  },
  onlineStatus: {
    fontSize: 11,
    color: "#10b981",
    fontWeight: "600",
  },
  callActions: {
    flexDirection: "row",
    gap: 8,
  },
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
    gap: 10,
  },
  bubbleWrapper: {
    flexDirection: "row",
    marginVertical: 4,
  },
  bubbleMeWrapper: {
    justifyContent: "flex-end",
  },
  bubbleOtherWrapper: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMe: {
    backgroundColor: brand.to,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextMe: {
    color: "#ffffff",
  },
  messageTextOther: {
    color: colors.heading,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  timeTextMe: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  timeTextOther: {
    color: colors.subtext,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
    gap: 10,
  },
  attachBtn: {
    padding: 6,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.inputFill,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
    color: colors.heading,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnActive: {
    backgroundColor: brand.to,
  },
});
