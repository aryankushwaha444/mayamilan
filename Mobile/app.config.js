// app.config.js
export default {
  expo: {
    name: "Maya Milan",
    slug: "mayamilan-mobile",
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
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              "mayamilan",
              "com.mayamilan.mobile",
              process.env.EXPO_PUBLIC_GOOGLE_REVERSED_CLIENT_ID,
            ],
          },
        ],
      },
    },
    android: {
      package: "com.mayamilan.mobile",
      permissions: ["INTERNET"],
      adaptiveIcon: {
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundColor: "#ffffff",
      },
    },
    plugins: [
      "expo-font",
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
    ],
  },
};
