// src/screens/HomeScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import { getSocket } from "../sockets/socket";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [sockId, setSockId] = useState<string>("…");

  useEffect(() => {
    const s = getSocket();
    const set = () => setSockId(s?.id ?? "disconnected");
    set();
    s?.on("connect", set);
    s?.on("disconnect", set);
    return () => {
      s?.off("connect", set);
      s?.off("disconnect", set);
    };
  }, []);

  return (
    <View style={s.wrap}>
      <Text style={s.h}>
        Signed in as {user?.name || user?.email || "user"}
      </Text>
      <Text style={s.p}>
        role: {user?.role ?? "—"} · socket: {sockId}
      </Text>
      <Button title="Log out" color="#e11d48" onPress={() => void logout()} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  h: { fontSize: 20, fontWeight: "700" },
  p: { color: "#64748b" },
});
