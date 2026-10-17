// app.config.js

const googleReversedClientId =
  process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID?.trim() || "";

export default {
  expo: {
    name: "Maya Milan",
    slug: "mayamilan-mobile",

    // Keep for Expo tooling/linking.
    // iOS URL scheme is explicitly defined below in CFBundleURLSchemes,
    // so Expo may warn that it ignores this abstract property on iOS.
    scheme: "mayamilan",

    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,

    splash: {
      image: "./assets/splash-icon.png",
      backgroundColor: "#ffffff",
    },

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mayamilan.mobile",

      infoPlist: {
        NSCameraUsageDescription:
          "MayaMilan requires camera access to take profile photos and make video calls.",

        NSMicrophoneUsageDescription:
          "MayaMilan requires microphone access for voice messages and audio/video calls.",

        NSPhotoLibraryUsageDescription:
          "MayaMilan requires access to your photos to upload matrimonial biodata pictures.",

        // Google Sign-In iOS needs the reversed client ID URL scheme.
        // Do not include undefined values.
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              "mayamilan",
              ...(googleReversedClientId ? [googleReversedClientId] : []),
            ],
          },
        ],

        // Optional: enable only if you intentionally want calls/audio to continue
        // in background. This has App Store review implications.
        // UIBackgroundModes: ["audio"],
      },
    },

    android: {
      package: "com.mayamilan.mobile",

      // Manifest declarations only.
      // Runtime permission prompts still must be requested by code before
      // camera/microphone use.
      permissions: [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.WAKE_LOCK",
        "android.permission.BLUETOOTH_CONNECT",
      ],

      adaptiveIcon: {
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundColor: "#ffffff",
      },
    },

    plugins: [
      "expo-font",

      // Keeps bundled assets resolving correctly from the app bundle.
      "expo-asset",

      [
        "expo-build-properties",
        {
          ios: {
            buildReactNativeFromSource: true,
            enableSceneSupport: true,
          },
        },
      ],

      "@react-native-community/datetimepicker",

      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],

      // Optional, only if you install expo-system-ui:
      // "expo-system-ui",
    ],
  },
};
