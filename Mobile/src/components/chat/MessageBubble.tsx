// src/components/chat/MessageBubble.tsx
import React from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, brand, cardShadow } from "../../theme";
import { isSafeMediaUrl } from "../../utils/media";
import { formatTime } from "../../utils/date";
import type { ChatMessage } from "../../types/chat";
import MessageStatusTick from "./MessageStatusTick";
import VoiceBubble from "./VoiceBubble";
import CallRow from "./CallRow";

interface Props {
  item: ChatMessage;
  isMe: boolean;
  onLongPress: (m: ChatMessage, e: any) => void;
  onImagePress: (url: string) => void;
}

const MessageBubble: React.FC<Props> = ({
  item,
  isMe,
  onLongPress,
  onImagePress,
}) => {
  if (item.type === "call" || item.callType) return <CallRow item={item} />;

  if (item.deletedForEveryone)
    return (
      <View style={[s.wrap, isMe ? s.me : s.other]}>
        <View style={[s.bubble, s.deleted]}>
          <Text style={s.deletedTxt}>This message was deleted</Text>
        </View>
      </View>
    );

  const mediaUrl = isSafeMediaUrl(item.attachment?.url)
    ? (item.attachment as any).url
    : null;
  const txt =
    typeof (item.text || item.content) === "string"
      ? item.text || item.content
      : "";

  const content = () => {
    switch (item.type) {
      case "image":
        return mediaUrl ? (
          <TouchableOpacity
            onPress={() => onImagePress(mediaUrl)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: mediaUrl }}
              style={s.img}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <Text style={[s.txt, isMe ? s.txtMe : s.txtOther]}>📷 Photo</Text>
        );
      case "gif":
        return mediaUrl ? (
          <TouchableOpacity
            onPress={() => onImagePress(mediaUrl)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: mediaUrl }}
              style={s.gif}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : (
          <Text style={[s.txt, isMe ? s.txtMe : s.txtOther]}>GIF</Text>
        );
      case "voice":
      case "audio":
        return mediaUrl ? (
          <VoiceBubble
            uri={mediaUrl}
            duration={(item.attachment as any)?.duration}
            isMe={isMe}
          />
        ) : (
          <Text style={[s.txt, isMe ? s.txtMe : s.txtOther]}>
            🎤 Voice message
          </Text>
        );
      case "sticker":
        return <Text style={s.sticker}>{txt || "😀"}</Text>;
      case "heart":
        return (
          <Ionicons name="heart" size={40} color={isMe ? "#fff" : brand.from} />
        );
      case "system":
        return <Text style={s.system}>{txt}</Text>;
      default:
        return txt ? (
          <Text style={[s.txt, isMe ? s.txtMe : s.txtOther]}>{txt}</Text>
        ) : null;
    }
  };

  const isMedia = item.type === "image" || item.type === "gif";
  const isCenter = item.type === "system";
  if (isCenter)
    return (
      <View style={s.centerWrap}>
        <Text style={s.system}>{txt}</Text>
      </View>
    );

  return (
    <Pressable
      onLongPress={(e) => onLongPress(item, e)}
      delayLongPress={500}
      style={({ pressed }) => [
        s.wrap,
        isMe ? s.me : s.other,
        pressed && s.pressed,
      ]}
    >
      <View
        style={[
          s.bubble,
          isMe ? s.bubbleMe : s.bubbleOther,
          isMedia && s.bubbleMedia,
        ]}
      >
        {content()}
        <View style={s.footer}>
          <Text style={[s.time, isMe ? s.timeMe : s.timeOther]}>
            {formatTime(item.createdAt)}
          </Text>
          <MessageStatusTick message={item} isMe={isMe} />
        </View>
      </View>
    </Pressable>
  );
};

export default React.memo(MessageBubble);

const s = StyleSheet.create({
  wrap: { flexDirection: "row", marginVertical: 2 },
  me: { justifyContent: "flex-end" },
  other: { justifyContent: "flex-start" },
  pressed: { opacity: 0.7 },
  centerWrap: { alignItems: "center", marginVertical: 6 },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    ...cardShadow,
  },
  bubbleMe: { backgroundColor: brand.from, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  bubbleMedia: { padding: 6 },
  img: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  gif: { width: 180, height: 140, borderRadius: 12, marginBottom: 4 },
  txt: { fontSize: 15, lineHeight: 21 },
  txtMe: { color: "#fff" },
  txtOther: { color: colors.heading },
  sticker: { fontSize: 56, lineHeight: 64 },
  system: { fontSize: 13, color: colors.subtext, textAlign: "center" },
  deleted: { backgroundColor: "rgba(0,0,0,0.06)", borderWidth: 0 },
  deletedTxt: { fontSize: 13, color: colors.subtext, fontStyle: "italic" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  time: { fontSize: 10 },
  timeMe: { color: "rgba(255,255,255,0.75)" },
  timeOther: { color: colors.subtext },
});
