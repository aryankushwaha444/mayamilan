import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function OAuthSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const userB64 = params.get("user");

    if (!token || !userB64) {
      console.error("Missing token or user data");
      navigate("/register");
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

      // Redirect to profile edit
      navigate("/");
    } catch (error) {
      console.error("OAuth success error:", error);
      navigate("/register");
    }
  }, [params, navigate]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "16px",
      }}
    >
      <div
        className="spinner-border text-primary"
        style={{ width: "3rem", height: "3rem" }}
      ></div>
      <p className="text-muted">Completing your sign-up...</p>
    </div>
  );
}

export default OAuthSuccess;
