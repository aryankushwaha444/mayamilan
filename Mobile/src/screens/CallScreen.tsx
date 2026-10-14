// src/screens/CallScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand } from "../theme";

const { width, height } = Dimensions.get("window");

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const partner = route.params?.partner || {
    name: "Aastha Sharma",
    photos: [{ url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800" }],
  };
  const isVideo = !!route.params?.isVideo;

  const [callStatus, setCallStatus] = useState<"connecting" | "ringing" | "connected">("ringing");
  const [seconds, setSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [videoOff, setVideoOff] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCallStatus("connected");
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let interval: any;
    if (callStatus === "connected") {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const endCall = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Background: Video feed or dark gradient */}
      {isVideo && !videoOff ? (
        <Image
          source={{
            uri:
              partner.photos?.[0]?.url ||
              "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800",
          }}
          style={styles.fullVideo}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={["#0f172a", "#1e1b4b", "#0f172a"]}
          style={styles.fullVideo}
        />
      )}

      {/* Dim Overlay */}
      <View style={styles.overlay} />

      {/* Top Header: Partner details and duration */}
      <View style={[styles.topHeader, { paddingTop: insets.top + 20 }]}>
        <View style={styles.avatarBorder}>
          <Image
            source={{
              uri:
                partner.photos?.[0]?.url ||
                "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500",
            }}
            style={styles.avatar}
          />
        </View>

        <Text style={styles.callerName}>{partner.name}</Text>
        <Text style={styles.callState}>
          {callStatus === "connected"
            ? `${isVideo ? "HD Video Call" : "Voice Call"} • ${formatTimer(seconds)}`
            : callStatus === "ringing"
            ? "Ringing MayaMilan connection..."
            : "Securing end-to-end call..."}
        </Text>
      </View>

      {/* Self View (Picture in Picture when Video Call) */}
      {isVideo && (
        <View style={styles.selfPip}>
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400",
            }}
            style={styles.selfVideo}
          />
          <View style={styles.pipBadge}>
            <Text style={styles.pipText}>You</Text>
          </View>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 30 }]}>
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={() => setIsMuted((m) => !m)}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={24}
            color={isMuted ? "#ef4444" : "#ffffff"}
          />
        </TouchableOpacity>

        {isVideo && (
          <TouchableOpacity
            style={[styles.controlBtn, videoOff && styles.controlBtnActive]}
            onPress={() => setVideoOff((v) => !v)}
          >
            <Ionicons
              name={videoOff ? "videocam-off" : "videocam"}
              size={24}
              color={videoOff ? "#ef4444" : "#ffffff"}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
          onPress={() => setIsSpeaker((s) => !s)}
        >
          <Ionicons
            name={isSpeaker ? "volume-high" : "volume-mute"}
            size={24}
            color={isSpeaker ? brand.from : "#ffffff"}
          />
        </TouchableOpacity>

        {/* End Call Button */}
        <TouchableOpacity
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={endCall}
          accessibilityLabel="End Call"
        >
          <Ionicons name="call" size={28} color="#ffffff" style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    position: "relative",
  },
  fullVideo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width,
    height,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  topHeader: {
    alignItems: "center",
    zIndex: 10,
    paddingHorizontal: 20,
  },
  avatarBorder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.4)",
    padding: 3,
    marginBottom: 14,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 42,
  },
  callerName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
  },
  callState: {
    fontSize: 14,
    color: "#cbd5e1",
    marginTop: 6,
    fontWeight: "500",
  },
  selfPip: {
    position: "absolute",
    top: 110,
    right: 20,
    width: 100,
    height: 140,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#ffffff",
    zIndex: 20,
    backgroundColor: "#1e293b",
  },
  selfVideo: {
    width: "100%",
    height: "100%",
  },
  pipBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pipText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    zIndex: 30,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  endCallBtn: {
    backgroundColor: "#ef4444",
    width: 64,
    height: 64,
    borderRadius: 32,
  },
});
