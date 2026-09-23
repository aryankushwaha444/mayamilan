import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Loader from "../components/Loader.jsx";
import SEO from "../components/SEO";

function OAuthSuccess() {
  const [params] = useSearchParams();
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const processOAuth = async () => {
      const token = params.get("token");
      const userB64 = params.get("user");

      // Validate required params
      if (!token || !userB64) {
        if (!cancelled) {
          setErrorMessage(
            "Missing authentication data. Please try signing in again."
          );
          setFailed(true);
        }
        return;
      }

      // Basic token format validation (JWT-like or opaque token)
      if (typeof token !== "string" || token.length < 10) {
        if (!cancelled) {
          setErrorMessage("Invalid authentication token. Please try again.");
          setFailed(true);
        }
        return;
      }

      try {
        // Decode and validate user data
        const userJson = atob(userB64);
        const user = JSON.parse(userJson);

        // Validate user object has required fields
        if (!user || typeof user !== "object" || !user._id || !user.email) {
          throw new Error("Invalid user data structure");
        }

        // Save credentials
        localStorage.setItem("accessToken", token);
        localStorage.setItem("user", JSON.stringify(user));

        // Notify AuthContext
        window.dispatchEvent(new Event("auth:login"));

        // Redirect based on role
        const destination = user.role === "admin" ? "/admin" : "/discover";

        // Small delay to ensure AuthContext processes the event
        if (!cancelled) {
          setTimeout(() => {
            if (!cancelled) {
              window.location.replace(destination);
            }
          }, 800);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage("Unable to complete sign-in. Please try again.");
          setFailed(true);
        }
      }
    };

    processOAuth();

    return () => {
      cancelled = true;
    };
  }, [params]);

  // Failed state — show error, then redirect
  if (failed) {
    useEffect(() => {
      const timer = setTimeout(() => {
        window.location.replace("/register");
      }, 3000);
      return () => clearTimeout(timer);
    }, []);

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

  // Success/loading state
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
