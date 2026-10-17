// src/components/feed/CreatePostForm.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, brand, radius } from "../../theme";
import { useAlert } from "../../context/AlertContext";
import { cleanText } from "./types";

const MAX_CONTENT = 2000;
const MAX_IMAGES = 4; // matches PostCard slice(0,4)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // mirror ChatInputBar (proven)
const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

// Crash-proof lazy picker (same pattern as the working ChatInputBar / chat photo upload).
const getImagePicker = (): any => {
  try {
    return require("expo-image-picker");
  } catch {
    return null;
  }
};

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}
export interface ComposerPayload {
  content: string;
  files: PickedFile[];
}

interface Props {
  onSubmit: (payload: ComposerPayload) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export default function CreatePostForm({
  onSubmit,
  disabled,
  placeholder = "Share a story, a tip, a moment…",
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useAlert();
  const locked = !!disabled || busy;
  const trimmed = cleanText(text, MAX_CONTENT);
  const canSubmit = (trimmed.length > 0 || files.length > 0) && !locked;

  const pickImages = async () => {
    if (locked) return;
    try {
      const ImagePicker = getImagePicker();
      if (!ImagePicker) {
        toast.info(
          "Photo posts need a fresh native build. Run: npx expo run:ios"
        );
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error("Please allow photo access to add images.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const next: PickedFile[] = [];
      for (const a of result.assets) {
        const mime = (a.mimeType || "image/jpeg").toLowerCase();
        if (!ALLOWED_IMAGE_MIME.includes(mime)) {
          toast.error("Only JPG, PNG, WebP, GIF or HEIC images are allowed.");
          continue;
        }
        if (a.fileSize && a.fileSize > MAX_FILE_SIZE) {
          toast.error("Each image must be under 10 MB.");
          continue;
        }
        next.push({
          uri: a.uri,
          name: a.fileName || `image-${Date.now()}-${next.length}.jpg`,
          type: mime,
        });
      }
      setFiles((prev) => [...prev, ...next].slice(0, MAX_IMAGES)); // cap total at 4
    } catch {
      toast.error("Could not attach the photo.");
    }
  };

  const removeFile = (uri: string) =>
    setFiles((prev) => prev.filter((f) => f.uri !== uri));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    const snapshotText = text,
      snapshotFiles = files;
    try {
      await onSubmit({ content: trimmed, files });
      setText("");
      setFiles([]); // clear only on success; on error we restore the draft below
    } catch {
      setText(snapshotText);
      setFiles(snapshotFiles); // keep draft + picked images on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={st.wrap}>
      <TextInput
        style={st.input}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        value={text}
        onChangeText={(v) => setText(v.slice(0, MAX_CONTENT))}
        multiline
        maxLength={MAX_CONTENT}
        editable={!locked}
        textAlignVertical="top"
        accessibilityLabel="Post content"
      />

      {files.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={st.strip}
          contentContainerStyle={st.stripRow}
        >
          {files.map((f) => (
            <View key={f.uri} style={st.thumbWrap}>
              {/* LOCAL preview rendered raw — isSafeMediaUrl would (correctly) reject a non-https
                  local uri and blank the user's own picked file. The REMOTE gate is at render
                  time in PostCard.imageUrl; the upload goes to OUR server. */}
              <Image
                source={{ uri: f.uri }}
                style={st.thumb}
                resizeMode="cover"
              />
              <TouchableOpacity
                style={st.thumbRemove}
                onPress={() => removeFile(f.uri)}
                accessibilityLabel="Remove image"
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={st.row}>
        <TouchableOpacity
          style={st.ghostBtn}
          onPress={pickImages}
          disabled={locked || files.length >= MAX_IMAGES}
          accessibilityLabel="Add photo"
        >
          <Ionicons
            name="image-outline"
            size={18}
            color={
              files.length >= MAX_IMAGES ? colors.placeholder : colors.subtext
            }
          />
          <Text
            style={[
              st.ghostTxt,
              files.length >= MAX_IMAGES && st.ghostDisabled,
            ]}
          >
            {files.length >= MAX_IMAGES ? `${MAX_IMAGES} max` : "Photo"}
          </Text>
        </TouchableOpacity>
        <Text
          style={[st.counter, trimmed.length >= MAX_CONTENT && st.counterLimit]}
        >
          {trimmed.length}/{MAX_CONTENT}
        </Text>
        <TouchableOpacity
          style={[st.postBtn, !canSubmit && st.postBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Publish post"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={st.postTxt}>Post</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12 },
  input: {
    flex: 1,
    minHeight: 140,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.heading,
    lineHeight: 22,
  },
  strip: { maxHeight: 96 },
  stripRow: { gap: 8, paddingRight: 8 },
  thumbWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.inputFill,
    position: "relative",
  },
  thumb: { width: "100%", height: "100%" },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  ghostTxt: { fontSize: 13, fontWeight: "700", color: colors.subtext },
  ghostDisabled: { color: colors.placeholder },
  counter: { flex: 1, textAlign: "right", fontSize: 12, color: colors.subtext },
  counterLimit: { color: colors.danger, fontWeight: "800" },
  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: brand.from,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.button,
  },
  postBtnDisabled: { opacity: 0.5 },
  postTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
