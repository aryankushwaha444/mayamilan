import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Loader from "../components/Loader.jsx";

function OAuthSuccess() {
  const [params] = useSearchParams();
  const handled = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = params.get("token");
    const userB64 = params.get("user");

    if (!token || !userB64) {
      console.error("Missing token or user data");
      setFailed(true);
      setTimeout(() => window.location.replace("/register"), 1500);
      return;
    }

    try {
      // Decode user data from base64
      const userJson = atob(userB64);
      const user = JSON.parse(userJson);

      // Save to localStorage
      localStorage.setItem("accessToken", token);
      localStorage.setItem("user", JSON.stringify(user));

      // Dispatch event so AuthContext picks it up
      window.dispatchEvent(new Event("auth:login"));

      // 👇 HARD REDIRECT — forces full page reload so AuthContext
      //    re-initializes WITH the token before ProtectedRoute checks
      setTimeout(() => {
        window.location.replace("/discover");
      }, 1200);
    } catch (error) {
      console.error("OAuth success error:", error);
      setFailed(true);
      setTimeout(() => window.location.replace("/register"), 1500);
    }
  }, [params]);

  if (failed) {
    return (
      <Loader
        full
        text="Sign-in failed"
        subtitle="Redirecting you back..."
        icon="x-circle-fill"
      />
    );
  }

  return (
    <Loader
      full
      text="Welcome Maya~Milan 💕"
      subtitle="Setting up your session..."
      icon="heart-fill"
    />
  );
}

export default OAuthSuccess;
