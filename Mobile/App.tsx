// App.tsx
import React from "react";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  if (!loaded) return null;
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
