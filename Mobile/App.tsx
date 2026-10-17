// App.tsx
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/context/AuthContext";
import { SocketProvider } from "./src/context/SocketContext";
import { AlertProvider } from "./src/context/AlertContext";
import { CallProvider } from "./src/context/CallContext";
import CallListener from "./src/navigation/CallListener";

import RootNavigator from "./src/navigation/RootNavigator";

import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";

import { GoogleSignin } from "@react-native-google-signin/google-signin";

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      console.warn(
        "Google Sign-In not configured: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing."
      );
      return;
    }

    try {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
        offlineAccess: true,
      });
    } catch (err) {
      console.warn("GoogleSignin.configure failed:", err);
    }
  }, []);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />

      <AuthProvider>
        <SocketProvider>
          <AlertProvider>
            <CallProvider>
              <RootNavigator />
              <CallListener />
            </CallProvider>
          </AlertProvider>
        </SocketProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
