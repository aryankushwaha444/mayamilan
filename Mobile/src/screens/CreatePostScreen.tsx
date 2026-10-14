// src/screens/CreatePostScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../theme";
import { createFeedPost } from "../api/posts";

export default function CreatePostScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const handlePublish = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await createFeedPost(content, selectedPhoto ? [selectedPhoto] : []);
      navigation.goBack();
    } catch {
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.heading} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Create Community Post</Text>

        <TouchableOpacity
          style={[styles.publishBtn, !content.trim() && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={!content.trim() || busy}
        >
          <Text style={styles.publishBtnText}>
            {busy ? "Sharing..." : "Post"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <TextInput
          placeholder="Share your wedding story, matchmaking advice, or family journey..."
          placeholderTextColor={colors.placeholder}
          multiline
          value={content}
          onChangeText={setContent}
          style={styles.inputArea}
        />

        {selectedPhoto && (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: selectedPhoto }} style={styles.photoPreview} />
            <TouchableOpacity
              style={styles.removePhoto}
              onPress={() => setSelectedPhoto(null)}
            >
              <Ionicons name="close" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Add photo attachment demo */}
        <TouchableOpacity
          style={styles.addMediaBtn}
          onPress={() =>
            setSelectedPhoto(
              "https://images.unsplash.com/photo-1519741497674-611481863552?w=800"
            )
          }
        >
          <Ionicons name="image-outline" size={20} color={brand.to} />
          <Text style={styles.addMediaText}>Add Ceremony / Story Photo</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
  },
  publishBtn: {
    backgroundColor: brand.to,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  publishBtnDisabled: {
    backgroundColor: colors.inputBorder,
  },
  publishBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  body: {
    padding: 18,
    gap: 16,
  },
  inputArea: {
    fontSize: 16,
    color: colors.heading,
    minHeight: 140,
    textAlignVertical: "top",
    lineHeight: 24,
  },
  photoPreviewWrap: {
    position: "relative",
    borderRadius: 14,
    overflow: "hidden",
  },
  photoPreview: {
    width: "100%",
    height: 200,
  },
  removePhoto: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addMediaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.inputFill,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  addMediaText: {
    fontSize: 14,
    color: brand.to,
    fontWeight: "600",
  },
});
