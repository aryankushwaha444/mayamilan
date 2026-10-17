// src/components/chat/ChatInputBar.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
// ✅ expo-audio recorder (hook must be static; module is installed & built).
//    If tsc ever flags one of these four names, it's a ONE-WORD rename like the
//    player fix — paste the line, do NOT guess.
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { colors, brand, radius } from "../../theme";

// ✅ Crash-proof lazy loader for the image picker (never a top-level import).
const getImagePicker = (): any => {
  try {
    return require("expo-image-picker");
  } catch {
    return null;
  }
};

export interface SendPayload {
  type: "text" | "image" | "voice" | "gif" | "sticker" | "heart";
  text?: string;
  fileUri?: string;
  mimeType?: string;
  fileName?: string;
  duration?: number;
  attachment?: { url: string; [key: string]: any };
}

// Hardcoded lists = no attacker-controlled URLs. GIFs are Giphy-only (allowlisted
// in constants/mediaHosts.ts); the casino-PWA unsplash vector can NEVER enter here.
const EMOJIS = [
  "😀",
  "😂",
  "😍",
  "🥰",
  "🤔",
  "😢",
  "😡",
  "",
  "🌹",
  "",
  "",
  "🎉",
  "❤️",
  "💔",
  "✨",
  "👀",
];
const STICKERS = [
  "😂",
  "😍",
  "🥳",
  "😭",
  "😡",
  "👍",
  "✨",
  "👀",
  "🌹",
  "🎂",
  "🐱",
];
const GIFS = [
  "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
  "https://media.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy.gif",
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif",
  "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
  "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif",
];

// Security constants (mirror backend limits)
const MAX_TEXT_LENGTH = 2000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_RECORDING_SECONDS = 180; // 3 min hard cap
const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
const ALLOWED_AUDIO_MIME = [
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/aac",
  "audio/webm",
  "audio/ogg",
];

interface Props {
  onSend: (payload: SendPayload) => Promise<void>;
  disabled?: boolean;
  bottomInset?: number;
}

export default function ChatInputBar({
  onSend,
  disabled,
  bottomInset = 12,
}: Props) {
  const [text, setText] = useState("");
  const [panel, setPanel] = useState<
    null | "plus" | "emoji" | "sticker" | "gif"
  >(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const sendingRef = useRef(false); // synchronous double-send lock
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const cancelRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        recorderRef.current?.stop?.();
      } catch {
        /* not recording / already stopped */
      }
    },
    []
  );

  const isDisabled = !!disabled || busy;

  // Central dispatcher: lock + generic error copy (no info leakage).
  const dispatch = async (payload: SendPayload, restoreText?: string) => {
    if (sendingRef.current || isDisabled) return;
    sendingRef.current = true;
    setBusy(true);
    try {
      await onSend(payload);
      setPanel(null);
    } catch (e: any) {
      if (restoreText !== undefined) setText(restoreText);
      const status = e?.response?.status;
      Alert.alert(
        "Send failed",
        status === 413
          ? "File is too large."
          : status === 415
          ? "Unsupported file type."
          : status === 429
          ? "Too many messages. Please slow down."
          : "Please check your connection and try again."
      );
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  const submitText = () => {
    const value = text.trim();
    if (!value || isDisabled) return;
    const snapshot = text;
    setText("");
    dispatch({ type: "text", text: value }, snapshot);
  };

  // ✅ VOICE via expo-audio hook, 3-min hard cap, graceful degrade.
  const startRecording = async () => {
    if (isDisabled) return;
    setPanel(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow microphone access to send voice messages."
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      // prepareToRecordAsync is version-sensitive; guard so a missing method no-ops
      // instead of throwing (record()/stop()/uri are the stable core members).
      await (recorder as any).prepareToRecordAsync?.();
      recorder.record();
      cancelRef.current = false;
      startRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_RECORDING_SECONDS) stopRecording(true);
          return s + 1;
        });
      }, 1000);
    } catch {
      Alert.alert("Microphone error", "Could not start recording.");
    }
  };

  const stopRecording = async (send: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      const uri = recorder.uri;
      const duration = Math.max(
        1,
        Math.floor((Date.now() - startRef.current) / 1000)
      );
      const mimeType = "audio/mp4";
      if (
        send &&
        !cancelRef.current &&
        uri &&
        ALLOWED_AUDIO_MIME.includes(mimeType)
      ) {
        await dispatch({
          type: "voice",
          fileUri: uri,
          mimeType,
          fileName: `voice-${Date.now()}.m4a`,
          duration,
        });
      }
    } catch {
      Alert.alert("Error", "Could not process the recording.");
    }
    setSeconds(0);
  };

  // ✅ PHOTO with size + MIME validation, lazy picker.
  const pickPhoto = async () => {
    if (isDisabled) return;
    setPanel(null);
    try {
      const ImagePicker = getImagePicker();
      if (!ImagePicker) {
        Alert.alert(
          "Rebuild required",
          "Photo sharing needs a fresh native build. Run: npx expo run:ios"
        );
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo access to share images."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"] as any,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const mime = (asset.mimeType || "image/jpeg").toLowerCase();
      if (!ALLOWED_IMAGE_MIME.includes(mime)) {
        Alert.alert(
          "Unsupported file",
          "Please choose a JPG, PNG, WebP, GIF or HEIC image."
        );
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        Alert.alert("File too large", "Images must be under 10 MB.");
        return;
      }
      await dispatch({
        type: "image",
        fileUri: asset.uri,
        mimeType: mime,
        fileName: asset.fileName || `photo-${Date.now()}.jpg`,
      });
    } catch {
      Alert.alert("Error", "Could not attach the photo.");
    }
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;
  const charCount = text.length;

  return (
    <View style={[s.composer, { paddingBottom: bottomInset }]}>
      {panel === "plus" && (
        <View style={s.panel}>
          <TouchableOpacity
            style={s.menuRow}
            onPress={startRecording}
            disabled={isDisabled}
          >
            <Ionicons name="mic" size={20} color={brand.from} />
            <Text style={s.menuText}>Voice Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.menuRow}
            onPress={pickPhoto}
            disabled={isDisabled}
          >
            <Ionicons name="image" size={20} color={brand.from} />
            <Text style={s.menuText}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => setPanel("gif")}
            disabled={isDisabled}
          >
            <Text style={s.gifLabel}>GIF</Text>
            <Text style={s.menuText}>GIF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.menuRow}
            onPress={() => setPanel("sticker")}
            disabled={isDisabled}
          >
            <Ionicons name="happy" size={20} color={brand.from} />
            <Text style={s.menuText}>Sticker</Text>
          </TouchableOpacity>
        </View>
      )}

      {panel === "emoji" && (
        <View style={s.panel}>
          <ScrollView
            style={{ maxHeight: 150 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={s.emojiGrid}>
              {EMOJIS.map((e, i) => (
                <TouchableOpacity
                  key={`${e}-${i}`}
                  onPress={() =>
                    setText((t) => (t + e).slice(0, MAX_TEXT_LENGTH))
                  }
                >
                  <Text style={s.emojiCell}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {panel === "sticker" && (
        <View style={s.panel}>
          <View style={s.emojiGrid}>
            {STICKERS.map((e, i) => (
              <TouchableOpacity
                key={`${e}-${i}`}
                onPress={() => dispatch({ type: "sticker", text: e })}
                disabled={isDisabled}
              >
                <Text style={s.stickerCell}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {panel === "gif" && (
        <View style={s.panel}>
          <ScrollView
            style={{ maxHeight: 180 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={s.gifGrid}>
              {GIFS.map((url) => (
                <TouchableOpacity
                  key={url}
                  style={s.gifCell}
                  onPress={() => dispatch({ type: "gif", attachment: { url } })}
                  disabled={isDisabled}
                >
                  <Image
                    source={{ uri: url }}
                    style={s.gifImg}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {recording ? (
        <View style={s.row}>
          <View style={s.recDot} />
          <Text style={s.recTime}>
            Recording {fmt(seconds)}
            {seconds >= MAX_RECORDING_SECONDS - 10
              ? ` (Max ${fmt(MAX_RECORDING_SECONDS)})`
              : ""}
          </Text>
          <TouchableOpacity
            style={s.iconBtnActive}
            onPress={() => stopRecording(true)}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              cancelRef.current = true;
              stopRecording(false);
            }}
          >
            <Ionicons name="trash" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.row}>
          <TouchableOpacity
            style={[s.iconBtn, panel === "plus" && s.iconBtnActiveSoft]}
            onPress={() => setPanel(panel === "plus" ? null : "plus")}
            disabled={isDisabled}
          >
            <Ionicons name="add" size={22} color={brand.from} />
          </TouchableOpacity>

          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Aa"
              placeholderTextColor={colors.placeholder}
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX_TEXT_LENGTH))}
              multiline
              editable={!isDisabled}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {charCount > MAX_TEXT_LENGTH * 0.8 && (
              <Text
                style={[
                  s.counter,
                  charCount >= MAX_TEXT_LENGTH && s.counterLimit,
                ]}
              >
                {charCount}/{MAX_TEXT_LENGTH}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => setPanel(panel === "emoji" ? null : "emoji")}
              disabled={isDisabled}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="happy"
                size={20}
                color={panel === "emoji" ? brand.from : colors.subtext}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              s.iconBtn,
              text.trim() && !isDisabled ? s.iconBtnActive : null,
            ]}
            onPress={submitText}
            disabled={!text.trim() || isDisabled}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={
                  text.trim() && !isDisabled ? colors.white : colors.placeholder
                }
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.heartBtn}
            onPress={() => dispatch({ type: "heart" })}
            disabled={isDisabled}
          >
            <Ionicons name="heart" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  composer: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    padding: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  menuText: { fontSize: 15, fontWeight: "600", color: colors.heading },
  gifLabel: {
    width: 20,
    textAlign: "center",
    color: brand.from,
    fontWeight: "800",
    fontSize: 11,
  },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  emojiCell: { fontSize: 24, padding: 6, width: 44, textAlign: "center" },
  stickerCell: { fontSize: 40, padding: 8, width: 64, textAlign: "center" },
  gifGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gifCell: {
    width: "31%",
    aspectRatio: 1.4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.inputFill,
  },
  gifImg: { width: "100%", height: "100%" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
    marginBottom: 15,
    marginLeft: 4,
  },
  recTime: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: colors.heading,
    marginBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.inputFill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActiveSoft: { backgroundColor: "rgba(225, 29, 116, 0.15)" },
  iconBtnActive: { backgroundColor: brand.from },
  heartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.from,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.inputFill,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.heading,
    maxHeight: 100,
    paddingTop: 4,
    paddingBottom: 4,
  },
  counter: { fontSize: 10, color: colors.subtext, marginBottom: 6 },
  counterLimit: { color: colors.danger, fontWeight: "700" },
});
