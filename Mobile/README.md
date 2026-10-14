# MayaMilan Mobile - Android & iOS Cross-Platform App

Complete, production-ready React Native & Expo mobile application for **MayaMilan** (माया मिलन) matrimonial and matchmaking platform.

Built with **100% code reuse** across Android and iOS while maintaining native platform behaviors, smooth gestures, and shared backend API architecture.

---

## 📱 Features Included

- **Discovery & Matchmaking**: Swipeable matrimonial cards with Like, Pass, and Super Like gestures.
- **Nepali & South Asian Matrimonial Biodata**: Rashi (Horoscope / Kundali), Gotra, Caste, Religion, Height, Diet, Family Background, and Education/Career.
- **Mutual Matches & Likes Received**: Real-time mutual matches carousel and "Liked You" explorer.
- **Real-Time Messaging & Chat**: Fast socket-enabled conversation threads, unread counters, and instant messaging.
- **Audio & Video Calling**: Integrated call interface with duration timer, mute mic, speaker toggle, and camera controls.
- **Matrimonial Community Feed**: Wedding success stories, couple advice, post reactions (hearts), and comments.
- **Account & Security**: Secure JWT storage in iOS Keychain / Android Keystore, 2FA toggle, blocked users list, and privacy controls.

---

## 🛠️ Shared Backend Architecture

Both Android and iOS connect to the exact same MayaMilan backend API (`/api/auth`, `/api/discovery`, `/api/likes`, `/api/matches`, `/api/messages`, `/api/posts`, `/api/users`).

### Host Resolution:
- **Android Emulator**: `http://10.0.2.2:5000`
- **iOS Simulator**: `http://localhost:5000`
- **Physical Device**: `http://<YOUR_LAN_IP>:5000` (e.g. `192.168.1.100:5000`)
- **Production Server**: `https://mayamilan.onrender.com`

You can change or configure the API URL anytime inside `src/api/client.ts`, via `.env`:
```bash
EXPO_PUBLIC_API_URL=https://mayamilan.onrender.com
EXPO_PUBLIC_SOCKET_URL=https://mayamilan.onrender.com
```
or directly in the mobile app under **Settings → Backend Server Configuration**!

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd Mobile
npm install
```

### 2. Start the Development Server
```bash
npx expo start
```
Scan the QR code with the **Expo Go** app on your Android or iPhone device!

---

## 🤖 Running on Android

### Using Android Emulator or Connected USB Device:
```bash
npx expo run:android
```

### Build Android APK / AAB with EAS Build:
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build APK for direct installation
eas build -p android --profile preview

# Build App Bundle (.aab) for Google Play Store
eas build -p android --profile production
```

---

## 🍏 Running on iOS

### Using iOS Simulator (macOS required):
```bash
npx expo run:ios
```

### Build iOS App with EAS Build (Cloud builds - no Mac required!):
```bash
# Build for internal testing / simulator
eas build -p ios --profile preview

# Build for TestFlight & Apple App Store
eas build -p ios --profile production
```

---

## 📂 Project Structure

```
Mobile/
├── App.tsx                     # Main App container & font loaders
├── app.json                    # Expo metadata for Android package & iOS bundle ID
├── eas.json                    # Cloud build profiles for APK, AAB, and IPA
├── package.json                # Dependencies and run scripts
├── src/
│   ├── api/                    # Shared API client & endpoints
│   │   ├── auth.ts             # Sign in, Sign up, OTP, Password reset
│   │   ├── client.ts           # Axios interceptors & auto backend host
│   │   ├── discovery.ts        # Match candidates & swiping actions
│   │   ├── matches.ts          # Mutual matches & likes received
│   │   ├── messages.ts         # Real-time chat & conversations
│   │   ├── posts.ts            # Matrimonial community feed & comments
│   │   └── user.ts             # Matrimonial biodata & photo uploads
│   ├── components/             # Reusable UI components & cards
│   │   ├── TurnstileBox.tsx    # Cloudflare security verification
│   │   └── ui.tsx              # Card, Field, GradientButton, Stepper
│   ├── context/
│   │   └── AuthContext.tsx     # Authentication state & session manager
│   ├── lib/
│   │   └── secureStore.ts      # Hardware-secured token storage
│   ├── navigation/
│   │   ├── MainTabNavigator.tsx# 5-tab bar (Discover, Matches, Feed, Chats, Biodata)
│   │   └── RootNavigator.tsx   # Stack navigator uniting auth & app screens
│   ├── screens/
│   │   ├── CallScreen.tsx      # Audio and Video call overlay
│   │   ├── ChatDetailScreen.tsx# Active conversation & chat bubbles
│   │   ├── CreatePostScreen.tsx# Publish community story
│   │   ├── DiscoverScreen.tsx  # Swipeable match cards & filters
│   │   ├── EditProfileScreen.tsx# Full matrimonial biodata editor
│   │   ├── FeedScreen.tsx      # Community feed & comments sheet
│   │   ├── ForgotPasswordScreen.tsx# Reset link
│   │   ├── LoginScreen.tsx     # Sign in with email or Google
│   │   ├── MatchesScreen.tsx   # Mutual connections & liked you grid
│   │   ├── MessagesScreen.tsx  # Conversation list & search
│   │   ├── NotificationsScreen.tsx# Activity alerts
│   │   ├── ProfileScreen.tsx   # Nepali matrimonial biodata view
│   │   ├── RegisterScreen.tsx  # 3-step registration flow
│   │   ├── SettingsScreen.tsx  # 2FA, privacy & backend URL changer
│   │   └── UserProfileScreen.tsx# Candidate biodata view
│   ├── sockets/
│   │   └── socket.ts           # Socket.io real-time connection
│   └── theme.ts                # Brand colors, typography & elevation
```
