// src/navigation/RootNavigator.tsx
// SINGLE stack. Tabs is one screen; every detail screen is a SIBLING of Tabs,
// so navigate("ChatDetail") from any tab screen bubbles Tabs -> root and works.
// (No nested second stack -> the "action not handled" bug cannot recur.)
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

import AuthNavigator from "./AuthNavigator";
import MainTabNavigator from "./MainTabNavigator";

// detail screens (grouped paths, depth-correct from src/navigation/)
import ChatDetailScreen from "../screens/chat/ChatDetailScreen";
import CallScreen from "../screens/call/CallScreen";
import UserProfileScreen from "../screens/main/UserProfileScreen";
import PostDetailScreen from "../screens/main/PostDetailScreen";
import CreatePostScreen from "../screens/main/CreatePostScreen";
import SavedPostsScreen from "../screens/main/SavedPostsScreen";
import SuggestionScreen from "../screens/main/SuggestionScreen";
import NotificationsScreen from "../screens/main/NotificationsScreen";
import EditProfileScreen from "../screens/main/EditProfileScreen";
import SettingsScreen from "../screens/main/SettingsScreen";
import ChangePasswordScreen from "../screens/auth/ChangePasswordScreen";
import DeleteAccountScreen from "../screens/auth/DeleteAccountScreen";
import AboutScreen from "../screens/legal/AboutScreen";
import SafetyScreen from "../screens/legal/SafetyScreen";
import SecurityPolicyScreen from "../screens/legal/SecurityPolicyScreen";
import { navigationRef } from "./navigationRef";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.pageBg,
        }}
      >
        <ActivityIndicator size="large" color={colors.iconTint} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{ contentStyle: { backgroundColor: colors.pageBg } }}
      >
        {isAuthenticated ? (
          <>
            {/* the tab navigator is just ONE screen of this stack */}
            <Stack.Screen
              name="Tabs"
              component={MainTabNavigator}
              options={{ headerShown: false }}
            />

            {/* every detail screen is a SIBLING -> reachable by bubbling from any tab */}
            <Stack.Screen
              name="ChatDetail"
              component={ChatDetailScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Call"
              component={CallScreen}
              options={{ headerShown: false, presentation: "fullScreenModal" }}
            />
            <Stack.Screen name="PostDetail" component={PostDetailScreen} />
            <Stack.Screen name="CreatePost" component={CreatePostScreen} />
            <Stack.Screen name="SavedPosts" component={SavedPostsScreen} />
            <Stack.Screen name="Suggestion" component={SuggestionScreen} />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
            />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen
              name="ChangePassword"
              component={ChangePasswordScreen}
            />
            <Stack.Screen
              name="DeleteAccount"
              component={DeleteAccountScreen}
            />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="Safety" component={SafetyScreen} />
            <Stack.Screen
              name="SecurityPolicy"
              component={SecurityPolicyScreen}
            />
          </>
        ) : (
          // nesting AuthNavigator is fine: when logged OUT there is no tab context
          // to bubble from, and its screens only navigate among themselves.
          <Stack.Screen
            name="Auth"
            component={AuthNavigator}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
