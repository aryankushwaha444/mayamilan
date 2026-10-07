import { useEffect, useState } from "react";
import Loader from "../components/Loader.jsx";
import SEO from "../components/SEO";
import api from "../utils/api.js";
import { setSigningKey, clearSigningKey } from "../utils/signRequest";

function OAuthSuccess() {
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fail = (msg) => {
      if (!cancelled) {
        setErrorMessage(msg);
        setFailed(true);
      }
    };

    const processOAuth = async () => {
      // ✅ Scrub any legacy query params immediately. The modern server flow
      // redirects to clean /oauth-success with NO token/user in the URL.
      try {
        window.history.replaceState({}, "", "/oauth-success");
      } catch {}

      // ✅ Never trust URL token/user. Clear stale client state first.
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      clearSigningKey();

      try {
        // ✅ Obtain access token + signing key from httpOnly refresh cookie.
        const refreshRes = await api.post("/auth/refresh");
        const accessToken = refreshRes?.data?.accessToken;
        const signingKey = refreshRes?.data?.signingKey;

        if (!accessToken || typeof accessToken !== "string") {
          throw new Error("No access token returned");
        }

        if (signingKey) {
          setSigningKey(signingKey);
        } else {
          clearSigningKey();
        }

        localStorage.setItem("accessToken", accessToken);

        // ✅ Fetch authoritative user/role from server.
        const meRes = await api.get("/auth/me");
        const rawUser = meRes?.data?.user ?? meRes?.user;

        if (!rawUser || typeof rawUser !== "object") {
          throw new Error("No user returned");
        }

        const userId = rawUser._id || rawUser.id;
        if (!userId) throw new Error("User id missing");

        const user = {
          ...rawUser,
          _id: userId,
          id: userId,
        };

        if (cancelled) return;

        localStorage.setItem("user", JSON.stringify(user));

        // Notify AuthContext that a session is now active in this tab.
        window.dispatchEvent(new Event("auth:login"));

        // Route by fetched server role, never by URL-provided data.
        const destination =
          user.role === "admin" || user.role === "superadmin"
            ? "/admin"
            : "/discover";

        setTimeout(() => {
          if (!cancelled) window.location.replace(destination);
        }, 600);
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        clearSigningKey();
        fail("Unable to complete sign-in. Please try again.");
      }
    };

    processOAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ UNCONDITIONAL effect (no Rules-of-Hooks violation).
  useEffect(() => {
    if (!failed) return;

    const timer = setTimeout(() => {
      window.location.replace("/login");
    }, 3000);

    return () => clearTimeout(timer);
  }, [failed]);

  if (failed) {
    return (
      <>
        <SEO title="Sign-In Failed" path="/oauth-success" noIndex />
        <main
          className="min-vh-100 d-flex align-items-center justify-content-center"
          id="main-content"
          role="status"
        >
          <div className="text-center p-4" style={{ maxWidth: 400 }}>
            <i
              className="bi bi-exclamation-circle-fill text-danger"
              style={{ fontSize: "3rem" }}
              aria-hidden="true"
            ></i>
            <h2 className="fw-bold mt-3 mb-2">Sign-In Failed</h2>
            <p className="text-muted mb-3">{errorMessage}</p>
            <small className="text-muted">Redirecting you back...</small>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SEO title="Signing In..." path="/oauth-success" noIndex />
      <main id="main-content" role="status">
        <Loader
          full
          text="Welcome to Maya~Milan 💕"
          subtitle="Setting up your session..."
          icon="heart-fill"
        />
      </main>
    </>
  );
}

export default OAuthSuccess;
