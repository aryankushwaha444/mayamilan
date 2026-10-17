// src/components/feed/ShareModal.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, brand, radius, cardShadow } from "../../theme";
import { useAlert } from "../../context/AlertContext";
import { getShareTargets, sharePost } from "../../api/posts";
import { isSafeMediaUrl, isObjectId } from "../../utils/media";

const DEFAULT_AVATAR = require("../../../assets/default-avatar.png"); // depth-2 => 3 hops

interface Target {
  _id: string;
  name: string;
  avatar: { uri: string } | number;
}
interface Props {
  postId: string;
  onClose: () => void;
}

// Tolerant read of getShareTargets (return shape not in #1): try plausible keys, drop any entry
// without a valid ObjectId, gate the photo. Fail-closed => empty list, never a crash, never a
// wrong SENT payload (the send below uses the certain sharePost shape from #1).
function readTargets(res: any): Target[] {
  const raw =
    res?.targets ?? res?.users ?? res?.data ?? (Array.isArray(res) ? res : []);
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((t: any): Target | null => {
      const id =
        typeof t?._id === "string"
          ? t._id
          : typeof t?.userId === "string"
          ? t.userId
          : null;
      if (!isObjectId(id)) return null;
      const photos = Array.isArray(t?.photos) ? t.photos : [];
      const pick = photos.find((p: any) => p?.isPrimary) || photos[0];
      const url = pick?.url;
      return {
        _id: id as string,
        name: typeof t?.name === "string" && t.name.trim() ? t.name : "Member",
        avatar: isSafeMediaUrl(url) ? { uri: url as string } : DEFAULT_AVATAR,
      };
    })
    .filter(Boolean) as Target[];
}

export default function ShareModal({ postId, onClose }: Props) {
  const toast = useAlert();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setTargets(readTargets(await getShareTargets()));
    } catch {
      setError(true);
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const send = async () => {
    const ids = [...selected];
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      await sharePost(postId, ids); // certain shape from #1
      toast.success(
        ids.length === 1
          ? "Shared with 1 member"
          : `Shared with ${ids.length} members`
      );
      onClose();
      // sharesCount reconciles via the socket post_shares_updated event (FeedScreen listens);
      // no optimistic bump here, to avoid a double-count when the socket arrives.
    } catch {
      toast.error("Couldn't share. Please try again.");
    } finally {
      // keep modal open to retry
      setBusy(false);
    }
  };

  const count = selected.size;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet}>
          <View style={st.head}>
            <Text style={st.title}>Share post</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close share"
            >
              <Ionicons name="close" size={22} color={colors.heading} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={st.center}>
              <ActivityIndicator color={brand.from} />
            </View>
          ) : error ? (
            <View style={st.center}>
              <Text style={st.muted}>Couldn't load share targets.</Text>
              <TouchableOpacity style={st.retry} onPress={load}>
                <Text style={st.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : targets.length === 0 ? (
            <View style={st.center}>
              <Text style={st.muted}>
                No members available to share with yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={targets}
              keyExtractor={(t) => t._id}
              contentContainerStyle={st.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={st.row}
                  onPress={() => toggle(item._id)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: selected.has(item._id) }}
                >
                  <Image source={item.avatar as any} style={st.avatar} />
                  <Text style={st.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Ionicons
                    name={
                      selected.has(item._id)
                        ? "checkmark-circle"
                        : "ellipse-outline"
                    }
                    size={22}
                    color={
                      selected.has(item._id) ? brand.from : colors.inputBorder
                    }
                  />
                </TouchableOpacity>
              )}
            />
          )}
          <View style={st.foot}>
            <Text style={st.countTxt}>
              {count ? `${count} selected` : "Select members"}
            </Text>
            <TouchableOpacity
              style={[st.sendBtn, (!count || busy) && st.sendBtnDisabled]}
              onPress={send}
              disabled={!count || busy}
              accessibilityRole="button"
              accessibilityLabel="Send share"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={st.sendTxt}>Share</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "72%",
    paddingBottom: 18,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  title: { fontSize: 17, fontWeight: "800", color: colors.heading },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 10,
  },
  muted: { fontSize: 14, color: colors.subtext, textAlign: "center" },
  retry: {
    backgroundColor: brand.from,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.button,
  },
  retryTxt: { color: "#fff", fontWeight: "800" },
  list: { padding: 12, gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.inputFill,
  },
  rowName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.heading },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
  },
  countTxt: { fontSize: 13, color: colors.subtext, fontWeight: "700" },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: brand.from,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.button,
    ...cardShadow,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
