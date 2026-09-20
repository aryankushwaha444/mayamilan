import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { avatarImg } from "../utils/cloudinary.js";
import api from "../utils/api.js";
import {
  getBlockedUsers,
  unblockUser,
  searchBlockableUsers,
} from "../services/userService.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

function Settings() {
  const navigate = useNavigate();
  const toast = useAlert();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState("security");

  // ---- Blocked users state ----
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockedTotal, setBlockedTotal] = useState(0);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblockLoading, setUnblockLoading] = useState(false);

  // ---- Security state ----
  const [twoFa, setTwoFa] = useState({
    enabled: false,
    backupCodesRemaining: 0,
  });
  const [sessions, setSessions] = useState([]);
  const [securityLoading, setSecurityLoading] = useState(false);

  // ---- 2FA modals ----
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);
  const [disableModal, setDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [blockQuery, setBlockQuery] = useState("");
  const [blockResults, setBlockResults] = useState([]);
  const [blockSearchLoading, setBlockSearchLoading] = useState(false);

  // ================= BLOCKED USERS =================
  const loadBlocked = useCallback(
    async (query = "") => {
      if (blockedLoading) return;
      setBlockedLoading(true);
      try {
        const data = await getBlockedUsers(query);
        setBlockedUsers(data.blockedUsers || []);
        setBlockedTotal(data.total || 0);
      } catch (err) {
        toast.error(
          err.response?.data?.message || "Failed to load blocked users",
          "Error",
          4000
        );
      } finally {
        setBlockedLoading(false);
      }
    },
    [toast, blockedLoading]
  );

  // ✅ Debounced search (ONLY ONE)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ✅ Load blocked users when tab changes or search changes (ONLY ONE)
  useEffect(() => {
    if (activeTab === "blocked" && !blockedLoading) {
      loadBlocked(search);
    }
  }, [activeTab, search]); // ✅ NO loadBlocked in deps

  const handleUnblock = async () => {
    if (!unblockTarget) return;
    setUnblockLoading(true);
    try {
      await unblockUser(unblockTarget._id);
      toast.success(
        `${unblockTarget.name} has been unblocked`,
        "Unblocked",
        3000
      );
      setUnblockTarget(null);
      loadBlocked(search);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to unblock",
        "Error",
        4000
      );
    } finally {
      setUnblockLoading(false);
    }
  };

  // ================= SECURITY =================
  const loadSecurity = useCallback(async () => {
    if (securityLoading) return;
    setSecurityLoading(true);
    try {
      const [faRes, sessRes] = await Promise.all([
        api.get("/2fa/status"),
        api.get("/auth/sessions"),
      ]);
      setTwoFa({
        enabled: faRes.data.enabled,
        backupCodesRemaining: faRes.data.backupCodesRemaining || 0,
      });
      setSessions(sessRes.data.sessions || []);
    } catch (err) {
      console.error("Load security error:", err);
    } finally {
      setSecurityLoading(false);
    }
  }, [securityLoading]);

  useEffect(() => {
    if (activeTab === "security" && !securityLoading) {
      loadSecurity();
    }
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = blockQuery.trim();
      if (q.length < 2) {
        setBlockResults([]);
        return;
      }
      setBlockSearchLoading(true);
      try {
        const data = await searchBlockableUsers(q);
        setBlockResults(data.users || []);
      } catch {
        setBlockResults([]);
      } finally {
        setBlockSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [blockQuery]);

  const handleToggleBlock = async (target) => {
    try {
      await api.post(`/users/${target._id}/block`);
      toast.success(
        target.isBlocked
          ? `${target.name} unblocked`
          : `${target.name} blocked`,
        "Done",
        3000
      );
      loadBlocked(search);
      const data = await searchBlockableUsers(blockQuery.trim());
      setBlockResults(data.users || []);
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Action failed",
        "Error",
        4000
      );
    }
  };

  const start2FASetup = async () => {
    setTwoFaBusy(true);
    try {
      const { data } = await api.post("/2fa/setup");
      setSetupData({ qrCode: data.qrCode, secret: data.secret });
      setVerifyCode("");
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to start 2FA setup",
        "Error",
        4000
      );
    } finally {
      setTwoFaBusy(false);
    }
  };

  const confirm2FASetup = async () => {
    if (verifyCode.length !== 6) {
      toast.error("Enter the 6-digit code", "Error", 3000);
      return;
    }
    setTwoFaBusy(true);
    try {
      const { data } = await api.post("/2fa/verify-setup", {
        totpCode: verifyCode,
      });
      setSetupData(null);
      setBackupCodes(data.backupCodes);
      loadSecurity();
    } catch (err) {
      toast.error(err.response?.data?.message || "Invalid code", "Error", 4000);
    } finally {
      setTwoFaBusy(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFaBusy(true);
    try {
      const payload = { totpCode: disableCode };
      
      // ✅ Only include password for local users
      const isLocalUser = !user?.oauthProvider || user.oauthProvider === "local";
      if (isLocalUser && disablePassword) {
        payload.password = disablePassword;
      }
      
      await api.post("/2fa/disable", payload);
      toast.success("2FA has been disabled", "Success", 3000);
      setDisableModal(false);
      setDisablePassword("");
      setDisableCode("");
      loadSecurity();
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to disable 2FA",
        "Error",
        4000
      );
    } finally {
      setTwoFaBusy(false);
    }
  };

  const revokeSession = async (id) => {
    try {
      await api.delete(`/auth/sessions/${id}`);
      toast.success("Session revoked", "Success", 3000);
      loadSecurity();
    } catch (err) {
      toast.error("Failed to revoke session", "Error", 4000);
    }
  };

  const revokeOthers = async () => {
    try {
      await api.post("/auth/sessions/revoke-others");
      toast.success("All other sessions revoked", "Success", 3000);
      loadSecurity();
    } catch (err) {
      toast.error("Failed to revoke sessions", "Error", 4000);
    }
  };

  return (
    <>
      <SEO
        title="Settings"
        description="Manage your security and privacy settings."
        path="/settings"
      />

      <div className="container py-4 py-md-5" style={{ maxWidth: 900 }}>
        <h1 className="fw-bold mb-4">Settings</h1>

        {/* Tabs */}
        <ul className="nav nav-pills mb-4 gap-2">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "security" ? "active" : ""}`}
              onClick={() => setActiveTab("security")}
            >
              <i className="bi bi-shield-lock me-2"></i>Security
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "blocked" ? "active" : ""}`}
              onClick={() => setActiveTab("blocked")}
            >
              <i className="bi bi-slash-circle me-2"></i>Blocked Users
              {blockedTotal > 0 && (
                <span className="badge bg-danger ms-2">{blockedTotal}</span>
              )}
            </button>
          </li>
        </ul>

        {/* ============ SECURITY TAB ============ */}
        {activeTab === "security" && (
          <div className="d-flex flex-column gap-4">
            {/* 2FA Card */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div>
                    <h5 className="fw-bold mb-1">
                      <i className="bi bi-phone me-2 text-primary"></i>
                      Two-Factor Authentication
                    </h5>
                    <p className="text-muted mb-0 small">
                      {twoFa.enabled
                        ? `Enabled · ${twoFa.backupCodesRemaining} backup codes remaining`
                        : "Add an extra layer of protection to your account"}
                    </p>
                  </div>
                  {twoFa.enabled ? (
                    <button
                      className="btn btn-outline-danger"
                      onClick={() => setDisableModal(true)}
                      disabled={twoFaBusy}
                    >
                      Disable 2FA
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={start2FASetup}
                      disabled={twoFaBusy}
                    >
                      Enable 2FA
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Password Card */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div>
                    <h5 className="fw-bold mb-1">
                      <i className="bi bi-key me-2 text-primary"></i>Password
                    </h5>
                    <p className="text-muted mb-0 small">
                      Change your password regularly to stay safe
                    </p>
                  </div>
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => navigate("/change-password")}
                  >
                    Change Password
                  </button>
                </div>
              </div>
            </div>

            {/* Sessions Card */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
                  <div>
                    <h5 className="fw-bold mb-1">
                      <i className="bi bi-laptop me-2 text-primary"></i>Active
                      Sessions
                    </h5>
                    <p className="text-muted mb-0 small">
                      {sessions.length} device(s) currently signed in
                    </p>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={revokeOthers}
                    >
                      Log out all other devices
                    </button>
                  )}
                </div>

                {securityLoading ? (
                  <div className="text-center py-3">
                    <span className="spinner-border spinner-border-sm"></span>
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="text-muted mb-0">No active sessions.</p>
                ) : (
                  <div className="list-group list-group-flush">
                    {sessions.map((s) => (
                      <div
                        key={s._id}
                        className="list-group-item d-flex justify-content-between align-items-center px-0"
                      >
                        <div>
                          <strong className="d-block small">
                            {s.deviceInfo || "Unknown device"}
                          </strong>
                          <small className="text-muted">
                            {s.lastIp} · Last active{" "}
                            {new Date(s.lastUsedAt).toLocaleString()}
                          </small>
                        </div>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => revokeSession(s._id)}
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ BLOCKED USERS TAB ============ */}
        {activeTab === "blocked" && (
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-slash-circle me-2 text-danger"></i>Blocked
                Users
              </h5>

              {/* Search filter */}
              <div className="input-group mb-4">
                <span className="input-group-text">
                  <i className="bi bi-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search blocked users by name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setSearchInput("")}
                  >
                    <i className="bi bi-x-lg"></i>
                  </button>
                )}
              </div>

              {blockedLoading ? (
                <div className="text-center py-4">
                  <span className="spinner-border"></span>
                </div>
              ) : blockedUsers.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <i
                    className="bi bi-emoji-smile"
                    style={{ fontSize: "2.5rem" }}
                  ></i>
                  <p className="mt-3 mb-0">
                    {search
                      ? `No blocked users match "${search}"`
                      : "You haven't blocked anyone."}
                  </p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {blockedUsers.map((bu) => {
                    const photo =
                      bu.photos?.find((p) => p.isPrimary) || bu.photos?.[0];
                    return (
                      <div
                        key={bu._id}
                        className="list-group-item d-flex justify-content-between align-items-center px-0 py-3"
                      >
                        <div className="d-flex align-items-center gap-3">
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: "50%",
                              overflow: "hidden",
                              background: "#f1f5f9",
                              flexShrink: 0,
                            }}
                          >
                            {photo?.url ? (
                              <img
                                src={avatarImg(photo.url)}
                                alt={bu.name}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <span className="d-flex w-100 h-100 align-items-center justify-content-center fw-bold text-secondary">
                                {bu.name?.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div>
                            <strong className="d-block">{bu.name}</strong>
                            <small className="text-muted">
                              Blocked you can't message each other
                            </small>
                          </div>
                        </div>
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => setUnblockTarget(bu)}
                        >
                          <i className="bi bi-unlock me-1"></i>Unblock
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============ 2FA SETUP MODAL (QR) ============ */}
      {setupData && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "100%",
              background: "white",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div className="p-4 text-center">
              <h5 className="fw-bold mb-3">Scan with Authenticator App</h5>
              <img
                src={setupData.qrCode}
                alt="2FA QR Code"
                style={{ width: 240, height: 240, margin: "0 auto" }}
              />
              <p className="text-muted small mt-3 mb-1">
                Or enter this key manually:
              </p>
              <code
                className="d-block bg-light p-2 rounded mb-3"
                style={{ letterSpacing: 2 }}
              >
                {setupData.secret}
              </code>

              <label className="form-label small fw-semibold">
                Enter 6-digit code
              </label>
              <input
                type="text"
                className="form-control form-control-lg text-center mb-3"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/\D/g, ""))
                }
                style={{ letterSpacing: 8, fontFamily: "monospace" }}
              />

              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-secondary flex-fill"
                  onClick={() => setSetupData(null)}
                  disabled={twoFaBusy}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary flex-fill"
                  onClick={confirm2FASetup}
                  disabled={twoFaBusy || verifyCode.length !== 6}
                >
                  {twoFaBusy ? "Verifying..." : "Verify & Enable"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ BACKUP CODES MODAL ============ */}
      {backupCodes && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "100%",
              background: "white",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <h5 className="fw-bold text-center mb-2">
              🔑 Save Your Backup Codes
            </h5>
            <p className="text-muted small text-center mb-3">
              Each code works once if you lose your phone. They are shown only
              once!
            </p>
            <div
              className="bg-light rounded p-3 mb-3"
              style={{ fontFamily: "monospace", fontSize: 15 }}
            >
              {backupCodes.map((c, i) => (
                <div key={i} className="d-flex justify-content-between py-1">
                  <span className="text-muted">{i + 1}.</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
            <button
              className="btn btn-outline-secondary w-100 mb-2"
              onClick={() =>
                navigator.clipboard?.writeText(backupCodes.join("\n"))
              }
            >
              <i className="bi bi-clipboard me-2"></i>Copy All
            </button>
            <button
              className="btn btn-primary w-100"
              onClick={() => setBackupCodes(null)}
            >
              I've Saved Them
            </button>
          </div>
        </div>
      )}

      {/* ============ DISABLE 2FA MODAL ============ */}
      {disableModal && (
        <div
          className="modal fade show d-block"
          tabIndex="-1"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "100%",
              background: "white",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <h5 className="fw-bold mb-3">Disable Two-Factor Authentication</h5>

            {/* ✅ Only show password field for local (non-OAuth) users */}
            {(!user?.oauthProvider || user.oauthProvider === "local") && (
              <>
                <label className="form-label small fw-semibold">Password</label>
                <input
                  type="password"
                  className="form-control mb-3"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </>
            )}

            {user?.oauthProvider === "google" && (
              <div className="alert alert-info py-2 mb-3 small">
                <i className="bi bi-google me-2"></i>
                Google account — password not required
              </div>
            )}

            <label className="form-label small fw-semibold">
              Current 2FA code (or backup code)
            </label>
            <input
              type="text"
              className="form-control mb-3"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="000000 or XXXXX-XXXXX"
            />
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-secondary flex-fill"
                onClick={() => setDisableModal(false)}
                disabled={twoFaBusy}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger flex-fill"
                onClick={handleDisable2FA}
                disabled={
                  twoFaBusy ||
                  !disableCode ||
                  ((!user?.oauthProvider || user.oauthProvider === "local") &&
                    !disablePassword)
                }
              >
                {twoFaBusy ? "Disabling..." : "Disable 2FA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ UNBLOCK CONFIRM ============ */}
      <ConfirmDialog
        open={unblockTarget !== null}
        title={`Unblock ${unblockTarget?.name || ""}?`}
        message="They will be able to see your profile and message you again."
        confirmText="Unblock"
        cancelText="Cancel"
        icon="bi-unlock"
        onCancel={() => setUnblockTarget(null)}
        onConfirm={handleUnblock}
      />
    </>
  );
}

export default Settings;
