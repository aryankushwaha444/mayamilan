import { useState } from "react";
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

  const isOAuthUser = user?.oauthProvider;

  const handleDelete = async () => {
    if (!isOAuthUser && !password) {
      toast.error("Please enter your password to confirm deactivation");
      return;
    }

    setLoading(true);
    try {
      const response = await api.delete("/account", {
        data: { password: isOAuthUser ? undefined : password },
      });

      toast.success(response.data.message);
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error(
        error.response?.data?.message || "Failed to deactivate account"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const response = await api.get("/account/export");

      const blob = new Blob([JSON.stringify(response.data.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maya-milan-data-${
        new Date().toISOString().split("T")[0]
      }.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Your data has been downloaded!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="delete-account-page"
      style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}
    >
      <h1>⚠️ Deactivate Your Account</h1>

      <div
        className="warning-box"
        style={{
          background: "#fef3c7",
          border: "2px solid #f59e0b",
          borderRadius: 8,
          padding: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        <h3 style={{ color: "#92400e", marginTop: 0 }}>15-Day Grace Period</h3>
        <p style={{ color: "#78350f" }}>
          Your account will be deactivated immediately, but you have{" "}
          <strong>15 days</strong> to change your mind:
        </p>
        <ul style={{ color: "#78350f" }}>
          <li>Your profile will be hidden from other users</li>
          <li>You can reactivate by logging in within 15 days</li>
          <li>
            After 15 days, your account and all data will be permanently deleted
          </li>
          <li>You have 3 login attempts to reactivate</li>
        </ul>
      </div>

      {step === 1 && (
        <div className="step-1">
          <h3>Before you go...</h3>
          <p>Would you like to download a copy of your data first?</p>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginTop: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleExport}
              disabled={loading}
              style={{
                padding: "0.75rem 1.5rem",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Downloading..." : "📥 Download My Data"}
            </button>
            <button
              onClick={() => setStep(2)}
              style={{
                padding: "0.75rem 1.5rem",
                background: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Continue to Deactivation →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="step-2">
          <h3>Confirm your identity</h3>
          {isOAuthUser ? (
            <p>
              You signed in with Google. Click below to confirm account
              deactivation.
            </p>
          ) : (
            <>
              <p>Please enter your password to confirm:</p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  marginBottom: "1rem",
                }}
              />
            </>
          )}
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => setStep(1)}
              style={{
                padding: "0.75rem 1.5rem",
                background: "#6b7280",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={loading || (!isOAuthUser && !password)}
              style={{
                padding: "0.75rem 1.5rem",
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor:
                  loading || (!isOAuthUser && !password)
                    ? "not-allowed"
                    : "pointer",
                opacity: loading || (!isOAuthUser && !password) ? 0.6 : 1,
              }}
            >
              Deactivate My Account
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Are you sure you want to deactivate?"
        message="Your account will be hidden and permanently deleted in 15 days unless you log back in."
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
  );
}
