// src/components/call/RemoteVideoTile.tsx
// Presentational remote background (the mock's fullVideo). Three states, mirroring the mock:
//  video + real stream  -> <RTCView> (local media handle, DTLS-SRTP-encrypted at signaling layer)
//  video + no stream yet -> the PRE-GATED avatar stand-in (avatarSource is the screen's
//                            safeAvatarSource output: isSafeMediaUrl OR bundled -> this tile
//                            constructs NO uri of its own, so zero attacker-URL surface)
//  audio call            -> gradient (matches the mock's audio branch)
// NOTE (placeholder-artifact correction): the mock keyed the background off local `videoOff`,
// which wrongly blanked the REMOTE feed when YOU turned off YOUR camera. videoOff now belongs to
// LocalVideoTile only; the remote view stays driven by stream/isVideo (you still see them when
// your own camera is off). This is the correct WebRTC behavior, not a silent change.
import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { RTCView, type MediaStream } from "react-native-webrtc";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  stream: MediaStream | null;
  isVideo: boolean;
  name: string;
  avatarSource: { uri: string } | number;
}

export default function RemoteVideoTile({
  stream,
  isVideo,
  name,
  avatarSource,
}: Props) {
  const url = isVideo ? stream?.toURL() : undefined;
  if (url) return <RTCView streamURL={url} objectFit="cover" style={st.full} />;
  if (isVideo)
    return (
      <Image
        source={avatarSource as any}
        style={st.full}
        resizeMode="cover"
        accessibilityLabel={`${name}'s photo`}
      />
    );
  return (
    <LinearGradient
      colors={["#0f172a", "#1e1b4b", "#0f172a"]}
      style={st.full}
    />
  );
}

const st = StyleSheet.create({
  full: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
