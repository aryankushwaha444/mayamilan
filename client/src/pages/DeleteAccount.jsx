import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import api from "../utils/api";
import { useAlert } from "../context/AlertContext";
import ConfirmDialog from "../components/ConfirmDialog";

export default function DeleteAccount() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useAlert();

  const [showConfirm, setShowConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const step2HeadingRef = useRef(null);
  const passwordInputRef = useRef(null);

  const isOAuthUser = !!user?.oauthProvider;

  // ✅ Focus management when switching steps
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        if (isOAuthUser) {
          step2HeadingRef.current?.focus();
        } else {
          passwordInputRef.current?.focus();
        }
      }, 100);
    }
  }, [step, isOAuthUser]);

  const handleDelete = async () => {
    if (!isOAuthUser && !password) {
      toast.error("Please enter your password to confirm deactivation");
      passwordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const response = await api.delete("/account", {
        data: { password: isOAuthUser ? undefined : password },
      });

      toast.success(
        response.data.message || "Account deactivated",
        "Deactivated",
        5000
      );
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error(
        error.response?.data?.message || "Failed to deactivate account",
        "Error",
        6000
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const response = await api.get("/account/export");

      if (!response.data?.data) {
        throw new Error("No data received from server");
      }

      const jsonString = JSON.stringify(response.data.data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `maya-milan-data-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Your data has been downloaded!", "Export Complete", 4000);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(
        error.response?.data?.message || "Failed to export data",
        "Export Failed",
        5000
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="delete-account-page" id="main-content">
      <div className="dac-container">
        <h1 className="dac-title">⚠️ Deactivate Your Account</h1>

        {/* Grace Period Warning */}
        <div className="dac-warning-box" role="alert">
          <h3 className="dac-warning-title">15-Day Grace Period</h3>
          <p>
            Your account will be deactivated immediately, but you have{" "}
            <strong>15 days</strong> to change your mind:
          </p>
          <ul>
            <li>Your profile will be hidden from other users</li>
            <li>You can reactivate by logging in within 15 days</li>
            <li>
              After 15 days, your account and all data will be permanently
              deleted
            </li>
            <li>You have 3 login attempts to reactivate</li>
          </ul>
        </div>

        {/* STEP 1: Data Export */}
        {step === 1 && (
          <section className="dac-step" aria-labelledby="step1-heading">
            <h3 id="step1-heading">Before you go...</h3>
            <p>Would you like to download a copy of your data first?</p>
            <div className="dac-actions">
              <button
                type="button"
                className="btn btn-primary dac-btn"
                onClick={handleExport}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      aria-hidden="true"
                    ></span>
                    Downloading...
                  </>
                ) : (
                  <>📥 Download My Data</>
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary dac-btn"
                onClick={() => setStep(2)}
              >
                Continue to Deactivation →
              </button>
            </div>
          </section>
        )}

        {/* STEP 2: Identity Confirmation */}
        {step === 2 && (
          <section className="dac-step" aria-labelledby="step2-heading">
            <h3 id="step2-heading" ref={step2HeadingRef} tabIndex={-1}>
              Confirm your identity
            </h3>

            {isOAuthUser ? (
              <p>
                You signed in with{" "}
                <strong>
                  {user.oauthProvider === "google"
                    ? "Google"
                    : user.oauthProvider}
                </strong>
                . Click below to confirm account deactivation.
              </p>
            ) : (
              <>
                <p>Please enter your password to confirm:</p>
                <div className="mb-3">
                  <label
                    htmlFor="deactivation-password"
                    className="form-label visually-hidden"
                  >
                    Password to confirm deactivation
                  </label>
                  <input
                    ref={passwordInputRef}
                    id="deactivation-password"
                    type="password"
                    className="form-control form-control-lg"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    aria-describedby="password-hint"
                    disabled={loading}
                  />
                  <small id="password-hint" className="text-muted">
                    Required to verify your identity before deactivation
                  </small>
                </div>
              </>
            )}

            <div className="dac-actions">
              <button
                type="button"
                className="btn btn-secondary dac-btn"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn btn-danger dac-btn"
                onClick={() => setShowConfirm(true)}
                disabled={loading || (!isOAuthUser && !password)}
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      aria-hidden="true"
                    ></span>
                    Deactivating...
                  </>
                ) : (
                  "Deactivate My Account"
                )}
              </button>
            </div>
          </section>
        )}

        {/* Final Confirmation Dialog */}
        <ConfirmDialog
          open={showConfirm}
          title="Are you sure you want to deactivate?"
          message="Your account will be hidden and permanently deleted in 15 days unless you log back in. This action starts the deletion countdown immediately."
          confirmText="Yes, deactivate"
          cancelText="Cancel"
          danger
          icon="bi-exclamation-triangle-fill"
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => {
            setShowConfirm(false);
            handleDelete();
          }}
        />
      </div>
    </main>
  );
}
