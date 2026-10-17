import { Linking } from "react-native";
export const linking = {
  prefixes: ["mayamilan://", "https://mayamilan.vercel.app"],
  config: {
    screens: {
      Tabs: {
        screens: {
          Home: "home",
          Discover: "discover",
          Matches: "matches",
          Messages: "messages",
          Profile: "profile",
        },
      },
      Stack: {
        screens: {
          ChatDetail: {
            path: "messages/:conversationId",
            parse: { conversationId: String },
          },
          UserProfile: { path: "users/:userId", parse: { userId: String } },
          PostDetail: { path: "feed/:postId", parse: { postId: String } },
        },
      },
    },
  },
  getInitialURL: async () => {
    const url = await Linking.getInitialURL();
    return url;
  },
};
