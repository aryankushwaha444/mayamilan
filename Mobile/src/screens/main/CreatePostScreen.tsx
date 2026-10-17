// src/screens/main/CreatePostScreen.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../theme";
import { useAlert } from "../../context/AlertContext";
import CreatePostForm, {
  ComposerPayload,
} from "../../components/feed/CreatePostForm";
import { createFeedPost } from "../../api/posts";
import { cleanText } from "../../components/feed/types";

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const toast = useAlert();

  const handleSubmit = async ({ content, files }: ComposerPayload) => {
    const text = cleanText(content, 2000);
    if (!text && files.length === 0) return;
    try {
      // multipart now (matches web createPost): content + image FILES under field "images".
      await createFeedPost(text, files);
      toast.success("Post published");
      navigation.goBack();
      // The feed prepends via the socket new_post event (Tier-1 SocketContext). If your backend
      // does NOT emit new_post back to the author, the post appears on pull-to-refresh.
    } catch (e: any) {
      const status = e?.response?.status;
      toast.error(
        status === 429
          ? "Slow down — try again in a moment."
          : status === 413
          ? "That post is too large."
          : "Couldn't publish. Please try again."
      );
      throw e; // rethrow so the form keeps the draft + picked images
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[st.container, { paddingTop: insets.top }]}
    >
      <View style={st.bar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={st.back}
          hitSlop={8}
          accessibilityLabel="Cancel"
        >
          <Ionicons name="close" size={24} color={colors.heading} />
        </TouchableOpacity>
        <Text style={st.title}>New Post</Text>
        <View style={{ width: 24 }} />
      </View>
      <CreatePostForm onSubmit={handleSubmit} />
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  back: { padding: 2 },
  title: { fontSize: 17, fontWeight: "800", color: colors.heading },
});
