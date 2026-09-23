import { useState, useEffect, useCallback, useRef } from "react";
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

  // Blocked users state
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockedTotal, setBlockedTotal] = useState(0);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblockLoading, setUnblockLoading] = useState(false);

  const blockedLoadingRef = useRef(false);
  const securityLoadingRef = useRef(false);

  // Security state
  const [twoFa, setTwoFa] = useState({
    enabled: false,
    backupCodesRemaining: 0,
  });
  const [sessions, setSessions] = useState([]);
  const [securityLoading, setSecurityLoading] = useState(false);

  // 2FA modals
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

  // Session revocation
  const [revokingSessionId, setRevokingSessionId] = useState(null);
  const [revokeOthersLoading, setRevokeOthersLoading] = useState(false);
  const [blockingUserId, setBlockingUserId] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeOthersConfirm, setRevokeOthersConfirm] = useState(false);

  // ✅ Modal refs for focus management
  const setupModalRef = useRef(null);
  const backupModalRef = useRef(null);
  const disableModalRef = useRef(null);
  const verifyInputRef = useRef(null);

  const isLocalUser = !user?.oauthProvider || user.oauthProvider === "local";

  // ================= BLOCKED USERS =================
  const loadBlocked = useCallback(
    async (query = "") => {
      if (blockedLoadingRef.current) return;
      blockedLoadingRef.current = true;
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
        blockedLoadingRef.current = false;
        setBlockedLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (activeTab === "blocked") loadBlocked(search);
  }, [activeTab, search, loadBlocked]);

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
    if (securityLoadingRef.current) return;
    securityLoadingRef.current = true;
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
      securityLoadingRef.current = false;
      setSecurityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security") loadSecurity();
  }, [activeTab, loadSecurity]);

  // Debounced block search
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
        const blockedIds = new Set(blockedUsers.map((u) => u._id));
        setBlockResults(
          (data.users || []).map((u) => ({
            ...u,
            isBlocked: blockedIds.has(u._id),
          }))
        );
      } catch {
        setBlockResults([]);
      } finally {
        setBlockSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [blockQuery, blockedUsers]);

  // ✅ Optimized block toggle — single refetch instead of 3 calls
  const handleToggleBlock = async (target) => {
    setBlockingUserId(target._id);
    try {
      if (target.isBlocked) {
        await unblockUser(target._id);
        toast.success(`${target.name} unblocked`, "Done", 3000);
      } else {
        await api.post(`/users/${target._id}/block`);
        toast.success(`${target.name} blocked`, "Done", 3000);
      }
      // Single refetch for both lists
      const [blockData, searchData] = await Promise.all([
        getBlockedUsers(search),
        blockQuery.trim().length >= 2
          ? searchBlockableUsers(blockQuery.trim())
          : Promise.resolve({ users: [] }),
      ]);
      setBlockedUsers(blockData.blockedUsers || []);
      setBlockedTotal(blockData.total || 0);
      const newBlockedIds = new Set(
        (blockData.blockedUsers || []).map((u) => u._id)
      );
      setBlockResults(
        (searchData.users || []).map((u) => ({
          ...u,
          isBlocked: newBlockedIds.has(u._id),
        }))
      );
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Action failed",
        "Error",
        4000
      );
    } finally {
      setBlockingUserId(null);
    }
  };

  // ================= 2FA =================
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
      if (isLocalUser && disablePassword) payload.password = disablePassword;
      await api.post("/2fa/disable", payload);
      toast.success("2FA has been disabled", "Success", 3000);
      setDisableModal(false);
      setDisablePassword("");
      setDisableCode("");
      loadSecurity();
    } catch (err) {
      if (err.response?.data?.signatureExpired) {
        toast.warning(
          "Request expired. Please try again.",
          "Session expired",
          5000
        );
        setTwoFaBusy(false);
        return;
      }
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
    setRevokingSessionId(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      toast.success("Session revoked", "Success", 3000);
      setRevokeTarget(null);
      loadSecurity();
    } catch (err) {
      toast.error("Failed to revoke session", "Error", 4000);
    } finally {
      setRevokingSessionId(null);
    }
  };

  const revokeOthers = async () => {
    setRevokeOthersLoading(true);
    try {
      await api.post("/auth/sessions/revoke-others");
      toast.success("All other sessions revoked", "Success", 3000);
      setRevokeOthersConfirm(false);
      loadSecurity();
    } catch (err) {
      toast.error("Failed to revoke sessions", "Error", 4000);
    } finally {
      setRevokeOthersLoading(false);
    }
  };

  // ✅ Focus trap helper for modals
  const useModalFocusTrap = (isOpen, modalRef, initialFocusRef) => {
    useEffect(() => {
      if (!isOpen) return;
      const previousFocus = document.activeElement;
      setTimeout(() => initialFocusRef?.current?.focus(), 100);

      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          if (isOpen === "setup") setSetupData(null);
          else if (isOpen === "backup") setBackupCodes(null);
          else if (isOpen === "disable") setDisableModal(false);
          return;
        }
        if (e.key === "Tab" && modalRef?.current) {
          const focusable = modalRef.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
        previousFocus?.focus?.();
      };
    }, [isOpen, modalRef, initialFocusRef]);
  };

  useModalFocusTrap(setupData ? "setup" : null, setupModalRef, verifyInputRef);
  useModalFocusTrap(backupCodes ? "backup" : null, backupModalRef, null);
  useModalFocusTrap(disableModal ? "disable" : null, disableModalRef, null);

  return (
    <>
      <SEO
        title="Settings"
        description="Manage your security and privacy settings."
        path="/settings"
        noIndex
      />

      <main className="container py-4 py-md-5 settings-page" id="main-content">
        <h1 className="fw-bold mb-4">Settings</h1>

        {/* Tabs with ARIA */}
        <div
          className="nav nav-pills mb-4 gap-2"
          role="tablist"
          aria-label="Settings tabs"
        >
          <button
            role="tab"
            aria-selected={activeTab === "security"}
            aria-controls="panel-security"
            id="tab-security"
            className={`nav-link ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            <i className="bi bi-shield-lock me-2" aria-hidden="true"></i>
            Security
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "blocked"}
            aria-controls="panel-blocked"
            id="tab-blocked"
            className={`nav-link ${activeTab === "blocked" ? "active" : ""}`}
            onClick={() => setActiveTab("blocked")}
          >
            <i className="bi bi-slash-circle me-2" aria-hidden="true"></i>
            Blocked Users
            {blockedTotal > 0 && (
              <span className="badge bg-danger ms-2">{blockedTotal}</span>
            )}
          </button>
        </div>

        {/* ═══ SECURITY TAB ═══ */}
        {activeTab === "security" && (
          <div
            id="panel-security"
            role="tabpanel"
            aria-labelledby="tab-security"
            className="d-flex flex-column gap-4"
          >
            {/* 2FA Card */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div>
                    <h5 className="fw-bold mb-1">
                      <i
                        className="bi bi-phone me-2 text-primary"
                        aria-hidden="true"
                      ></i>
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

            {/* Password Card (local users only) */}
            {isLocalUser && (
              <div className="card border-0 shadow-sm">
                <div className="card-body p-4">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                    <div>
                      <h5 className="fw-bold mb-1">
                        <i
                          className="bi bi-key me-2 text-primary"
                          aria-hidden="true"
                        ></i>
                        Password
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
            )}

            {/* OAuth Info Card */}
            {!isLocalUser && (
              <div className="card border-0 shadow-sm">
                <div className="card-body p-4">
                  <div className="d-flex align-items-center gap-3">
                    <div className="settings-oauth-icon">
                      <i
                        className="bi bi-google text-white"
                        aria-hidden="true"
                      ></i>
                    </div>
                    <div>
                      <h5 className="fw-bold mb-1">
                        Signed in with{" "}
                        {user.oauthProvider === "google"
                          ? "Google"
                          : user.oauthProvider}
                      </h5>
                      <p className="text-muted mb-0 small">
                        Your account is managed through Google. Password changes
                        are not available.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sessions Card */}
            <div className="card border-0 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
                  <div>
                    <h5 className="fw-bold mb-1">
                      <i
                        className="bi bi-laptop me-2 text-primary"
                        aria-hidden="true"
                      ></i>
                      Active Sessions
                    </h5>
                    <p className="text-muted mb-0 small">
                      {sessions.length} device(s) currently signed in
                    </p>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => setRevokeOthersConfirm(true)}
                      disabled={revokeOthersLoading}
                    >
                      {revokeOthersLoading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            aria-hidden="true"
                          ></span>
                          Revoking...
                        </>
                      ) : (
                        "Log out all other devices"
                      )}
                    </button>
                  )}
                </div>

                {securityLoading ? (
                  <div className="text-center py-3" role="status">
                    <span className="spinner-border spinner-border-sm"></span>
                    <span className="visually-hidden">Loading sessions...</span>
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
                            <time dateTime={s.lastUsedAt}>
                              {new Date(s.lastUsedAt).toLocaleString()}
                            </time>
                          </small>
                        </div>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => setRevokeTarget(s)}
                          disabled={revokingSessionId === s._id}
                          aria-label={`Revoke session on ${
                            s.deviceInfo || "unknown device"
                          }`}
                        >
                          {revokingSessionId === s._id ? (
                            <span
                              className="spinner-border spinner-border-sm"
                              aria-hidden="true"
                            ></span>
                          ) : (
                            "Revoke"
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ BLOCKED USERS TAB ═══ */}
        {activeTab === "blocked" && (
          <div
            id="panel-blocked"
            role="tabpanel"
            aria-labelledby="tab-blocked"
            className="card border-0 shadow-sm"
          >
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3">
                <i
                  className="bi bi-slash-circle me-2 text-danger"
                  aria-hidden="true"
                ></i>
                Blocked Users
              </h5>

              <div className="input-group mb-4">
                <label htmlFor="blocked-search" className="visually-hidden">
                  Search blocked users
                </label>
                <span className="input-group-text">
                  <i className="bi bi-search" aria-hidden="true"></i>
                </span>
                <input
                  id="blocked-search"
                  type="search"
                  className="form-control"
                  placeholder="Search blocked users by name..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                  >
                    <i className="bi bi-x-lg" aria-hidden="true"></i>
                  </button>
                )}
              </div>

              {blockedLoading ? (
                <div className="text-center py-4" role="status">
                  <span className="spinner-border"></span>
                  <span className="visually-hidden">
                    Loading blocked users...
                  </span>
                </div>
              ) : blockedUsers.length === 0 ? (
                <div className="text-center py-5 text-muted" role="status">
                  <i
                    className="bi bi-emoji-smile fs-1 mb-3"
                    aria-hidden="true"
                  ></i>
                  <p className="mb-0">
                    {search
                      ? `No blocked users match "${search}"`
                      : "You haven't blocked anyone."}
                  </p>
                </div>
              ) : (
                <div
                  className="list-group list-group-flush"
                  role="list"
                  aria-label="Blocked users"
                >
                  {blockedUsers.map((bu) => {
                    const photo =
                      bu.photos?.find((p) => p.isPrimary) || bu.photos?.[0];
                    return (
                      <div
                        key={bu._id}
                        className="list-group-item d-flex justify-content-between align-items-center px-0 py-3"
                        role="listitem"
                      >
                        <div className="d-flex align-items-center gap-3">
                          <div className="settings-avatar">
                            {photo?.url ? (
                              <img
                                src={avatarImg(photo.url)}
                                alt=""
                                loading="lazy"
                                className="settings-avatar-img"
                              />
                            ) : (
                              <span className="settings-avatar-initial">
                                {bu.name?.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div>
                            <strong className="d-block">{bu.name}</strong>
                            <small className="text-muted">
                              Blocked — you can't message each other
                            </small>
                          </div>
                        </div>
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => setUnblockTarget(bu)}
                          disabled={unblockLoading}
                          aria-label={`Unblock ${bu.name}`}
                        >
                          {unblockLoading ? (
                            <span
                              className="spinner-border spinner-border-sm"
                              aria-hidden="true"
                            ></span>
                          ) : (
                            <>
                              <i
                                className="bi bi-unlock me-1"
                                aria-hidden="true"
                              ></i>
                              Unblock
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ═══ 2FA SETUP MODAL ═══ */}
      {setupData && (
        <div
          className="settings-modal-overlay"
          onClick={() => !twoFaBusy && setSetupData(null)}
        >
          <div
            ref={setupModalRef}
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-2fa-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 text-center">
              <h5 id="setup-2fa-title" className="fw-bold mb-3">
                Scan with Authenticator App
              </h5>
              <img
                src={setupData.qrCode}
                alt="2FA QR Code"
                className="settings-qr-img"
              />
              <p className="text-muted small mt-3 mb-1">
                Or enter this key manually:
              </p>
              <code className="d-block bg-light p-2 rounded mb-3 settings-secret-code">
                {setupData.secret}
              </code>
              <label
                htmlFor="setup-verify-code"
                className="form-label small fw-semibold"
              >
                Enter 6-digit code
              </label>
              <input
                ref={verifyInputRef}
                id="setup-verify-code"
                type="text"
                className="form-control form-control-lg text-center mb-3 otp-input"
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]{6}"
                placeholder="000000"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/\D/g, ""))
                }
                autoComplete="one-time-code"
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

      {/* ═══ BACKUP CODES MODAL ═══ */}
      {backupCodes && (
        <div
          className="settings-modal-overlay"
          onClick={() => setBackupCodes(null)}
        >
          <div
            ref={backupModalRef}
            className="settings-modal settings-modal-padded"
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-codes-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h5 id="backup-codes-title" className="fw-bold text-center mb-2">
              🔑 Save Your Backup Codes
            </h5>
            <p className="text-muted small text-center mb-3">
              Each code works once if you lose your phone. They are shown only
              once!
            </p>
            <div className="settings-backup-codes-list">
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
              <i className="bi bi-clipboard me-2" aria-hidden="true"></i>Copy
              All
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

      {/* ═══ DISABLE 2FA MODAL ═══ */}
      {disableModal && (
        <div
          className="settings-modal-overlay"
          onClick={() => !twoFaBusy && setDisableModal(false)}
        >
          <div
            ref={disableModalRef}
            className="settings-modal settings-modal-padded"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-2fa-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h5 id="disable-2fa-title" className="fw-bold mb-3">
              Disable Two-Factor Authentication
            </h5>
            {isLocalUser && (
              <>
                <label
                  htmlFor="disable-password"
                  className="form-label small fw-semibold"
                >
                  Password
                </label>
                <input
                  id="disable-password"
                  type="password"
                  className="form-control mb-3"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </>
            )}
            {!isLocalUser && (
              <div className="alert alert-info py-2 mb-3 small" role="status">
                <i className="bi bi-google me-2" aria-hidden="true"></i>Google
                account — password not required
              </div>
            )}
            <label
              htmlFor="disable-code"
              className="form-label small fw-semibold"
            >
              Current 2FA code (or backup code)
            </label>
            <input
              id="disable-code"
              type="text"
              className="form-control mb-3"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="000000 or XXXXX-XXXXX"
              autoComplete="one-time-code"
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
                  twoFaBusy || !disableCode || (isLocalUser && !disablePassword)
                }
              >
                {twoFaBusy ? "Disabling..." : "Disable 2FA"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
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
      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke Session?"
        message={`This will log out the device: ${
          revokeTarget?.deviceInfo || "Unknown"
        }. The user will need to log in again on that device.`}
        confirmText="Revoke"
        cancelText="Cancel"
        icon="bi-laptop"
        danger
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => revokeSession(revokeTarget._id)}
      />
      <ConfirmDialog
        open={revokeOthersConfirm}
        title="Log Out All Other Devices?"
        message={`This will revoke ${
          sessions.length - 1
        } other session(s). You will remain logged in on this device.`}
        confirmText="Log Out All"
        cancelText="Cancel"
        icon="bi-shield-exclamation"
        danger
        onCancel={() => setRevokeOthersConfirm(false)}
        onConfirm={revokeOthers}
      />
    </>
  );
}

export default Settings;
