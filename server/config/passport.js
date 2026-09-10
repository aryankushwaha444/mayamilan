import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User.js";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        // Find by email OR by google id
        let user = await User.findOne({
          $or: [{ email }, { oauthId: profile.id, oauthProvider: "google" }],
        });

        // New user → create with DEFAULTS so model validation passes
        if (!user) {
          user = await User.create({
            name: profile.displayName,
            email,
            oauthProvider: "google",
            oauthId: profile.id,
            isVerified: true, // Google already verified the email

            // REQUIRED FIELDS — safe defaults, user updates in profile edit
            gender: "other",
            dateOfBirth: new Date("2000-01-01"),
            relationshipGoal: "not-sure",
          });
        }
        // Existing local user → link Google to their account
        else if (!user.oauthId) {
          user.oauthProvider = "google";
          user.oauthId = profile.id;
          await user.save();
          console.log("🔗 Google linked to existing account:", email);
        }

        return done(null, user);
      } catch (error) {
        console.error("Google strategy error:", error.message);
        return done(error, null);
      }
    }
  )
);

export default passport;
