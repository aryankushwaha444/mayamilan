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

function deviceLabel(s) {
  if (!s) return "Unknown device";
  if (typeof s.deviceInfo === "string" && s.deviceInfo.trim())
    return s.deviceInfo;
  return s.deviceInfo?.label || "Unknown device";
}

// ✅ Minimal Cloudflare Turnstile loader, used ONLY when the server demands a
// 'turnstile' step-up (OAuth users in prod with TURNSTILE_ENABLED=true). If your
// app already exposes window.turnstile (login widget), this reuses it; if the
// sitekey env name differs, change VITE_TURNSTILE_SITE_KEY below or send me your
// Turnstile component and I'll match it. When unavailable, the UI shows a clear
// "security check unavailable" message instead of a silent hole or a crash.
const TS_SITEKEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
function loadTurnstileScript() {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve(window.turnstile);
    if (document.getElementById("turnstile-script")) {
      const iv = setInterval(() => {
        if (window.turnstile) {
          clearInterval(iv);
          resolve(window.turnstile);
        }
      }, 100);
      return;
    }
    const s = document.createElement("script");
    s.id = "turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

function Settings() {
  const navigate = useNavigate();
  const toast = useAlert();
  const { user } = useAuth();

  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [activeTab, setActiveTab] = useState("security");

  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockedTotal, setBlockedTotal] = useState(0);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblockLoading, setUnblockLoading] = useState(false);

  const [twoFa, setTwoFa] = useState({
    enabled: false,
    backupCodesRemaining: 0,
    reauthRequired: false, // ✅ from server
    reauthMethod: null, // ✅ 'password' | 'turnstile' | null
  });
  const [sessions, setSessions] = useState([]);
  const [securityLoading, setSecurityLoading] = useState(false);

  // 2FA modals
  const [setupStage, setSetupStage] = useState(null); // 'factor' | 'qr' | null
  const [setupFactorKind, setSetupFactorKind] = useState(null); // 'password' | 'turnstile'
  const [setupPassword, setSetupPassword] = useState("");
  const [setupTurnstileToken, setSetupTurnstileToken] = useState("");
  const [setupFactorErr, setSetupFactorErr] = useState("");
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

  const [revokingSessionId, setRevokingSessionId] = useState(null);
  const [revokeOthersLoading, setRevokeOthersLoading] = useState(false);
  const [blockingUserId, setBlockingUserId] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeOthersConfirm, setRevokeOthersConfirm] = useState(false);

  const setupModalRef = useRef(null);
  const backupModalRef = useRef(null);
  const disableModalRef = useRef(null);
  const verifyInputRef = useRef(null);
  const turnstileElRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);

  const blockedReqRef = useRef(0);
  const securityReqRef = useRef(0);
  const blockSearchReqRef = useRef(0);
  const blockedUsersRef = useRef(blockedUsers);
  useEffect(() => {
    blockedUsersRef.current = blockedUsers;
  }, [blockedUsers]);

  const togglingRef = useRef(new Set());
  const unblockingRef = useRef(false);
  const revokingRef = useRef(new Set());

  const isLocalUser = !user?.oauthProvider || user.oauthProvider === "local";
  const otherDeviceCount = sessions.filter((s) => !s.isCurrentDevice).length;

  // ================= BLOCKED USERS =================
  const loadBlocked = useCallback(async (query = "") => {
    const id = ++blockedReqRef.current;
    setBlockedLoading(true);
    try {
      const data = await getBlockedUsers(query);
      if (id !== blockedReqRef.current) return;
      setBlockedUsers(
        Array.isArray(data?.blockedUsers) ? data.blockedUsers : []
      );
      setBlockedTotal(Number(data?.total) || 0);
    } catch (err) {
      if (id !== blockedReqRef.current) return;
      toastRef.current?.error?.(
        err.response?.data?.message || "Failed to load blocked users",
        "Error",
        4000
      );
    } finally {
      if (id === blockedReqRef.current) setBlockedLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (activeTab === "blocked") loadBlocked(search);
  }, [activeTab, search, loadBlocked]);

  const handleUnblock = async () => {
    if (!unblockTarget || unblockingRef.current) return;
    unblockingRef.current = true;
    setUnblockLoading(true);
    try {
      await unblockUser(unblockTarget._id);
      toastRef.current?.success?.(
        `${unblockTarget.name} has been unblocked`,
        "Unblocked",
        3000
      );
      setUnblockTarget(null);
      loadBlocked(search);
    } catch (err) {
      toastRef.current?.error?.(
        err.response?.data?.message || "Failed to unblock",
        "Error",
        4000
      );
    } finally {
      unblockingRef.current = false;
      setUnblockLoading(false);
    }
  };

  // ================= SECURITY =================
  const loadSecurity = useCallback(async () => {
    const id = ++securityReqRef.current;
    setSecurityLoading(true);
    try {
      const [faRes, sessRes] = await Promise.all([
        api.get("/2fa/status"),
        api.get("/auth/sessions"),
      ]);
      if (id !== securityReqRef.current) return;
      setTwoFa({
        enabled: !!faRes?.data?.enabled,
        backupCodesRemaining: Number(faRes?.data?.backupCodesRemaining) || 0,
        reauthRequired: !!faRes?.data?.reauthRequired, // ✅
        reauthMethod: faRes?.data?.reauthMethod || null, // ✅
      });
      setSessions(
        Array.isArray(sessRes?.data?.sessions) ? sessRes.data.sessions : []
      );
    } catch (err) {
      if (id !== securityReqRef.current) return;
      console.error("Load security error:", err);
    } finally {
      if (id === securityReqRef.current) setSecurityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security") loadSecurity();
  }, [activeTab, loadSecurity]);

  useEffect(() => {
    const q = blockQuery.trim();
    if (q.length < 2) {
      setBlockResults([]);
      return;
    }
    const id = ++blockSearchReqRef.current;
    const t = setTimeout(async () => {
      setBlockSearchLoading(true);
      try {
        const data = await searchBlockableUsers(q);
        if (id !== blockSearchReqRef.current) return;
        const blockedIds = new Set(
          (blockedUsersRef.current || []).map((u) => u._id)
        );
        setBlockResults(
          (Array.isArray(data?.users) ? data.users : []).map((u) => ({
            ...u,
            isBlocked: blockedIds.has(u._id),
          }))
        );
      } catch {
        if (id === blockSearchReqRef.current) setBlockResults([]);
      } finally {
        if (id === blockSearchReqRef.current) setBlockSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [blockQuery]);

  const handleToggleBlock = async (target) => {
    if (!target?._id || togglingRef.current.has(target._id)) return;
    togglingRef.current.add(target._id);
    setBlockingUserId(target._id);
    try {
      if (target.isBlocked) {
        await unblockUser(target._id);
        toastRef.current?.success?.(`${target.name} unblocked`, "Done", 3000);
      } else {
        await api.post(`/users/${target._id}/block`);
        toastRef.current?.success?.(`${target.name} blocked`, "Done", 3000);
      }
      const [blockData, searchData] = await Promise.all([
        getBlockedUsers(search),
        blockQuery.trim().length >= 2
          ? searchBlockableUsers(blockQuery.trim())
          : Promise.resolve({ users: [] }),
      ]);
      const nextBlocked = Array.isArray(blockData?.blockedUsers)
        ? blockData.blockedUsers
        : [];
      setBlockedUsers(nextBlocked);
      setBlockedTotal(Number(blockData?.total) || 0);
      const newBlockedIds = new Set(nextBlocked.map((u) => u._id));
      setBlockResults(
        (Array.isArray(searchData?.users) ? searchData.users : []).map((u) => ({
          ...u,
          isBlocked: newBlockedIds.has(u._id),
        }))
      );
    } catch (err) {
      toastRef.current?.error?.(
        err.response?.data?.message || "Action failed",
        "Error",
        4000
      );
    } finally {
      togglingRef.current.delete(target._id);
      setBlockingUserId(null);
    }
  };

  // ================= 2FA =================
  // POST /2fa/setup with the (optional) step-up body; on success move to QR stage.
  const runSetup = useCallback(async (body) => {
    setTwoFaBusy(true);
    setSetupFactorErr("");
    try {
      const { data } = await api.post("/2fa/setup", body || {});
      setSetupData({ qrCode: data.qrCode, secret: data.secret });
      setSetupStage("qr");
      setVerifyCode("");
      setSetupPassword("");
      setSetupTurnstileToken("");
    } catch (err) {
      const d = err.response?.data;
      if (err.response?.status === 428 || d?.reauth_required) {
        setSetupFactorErr(d?.message || "Verification required. Try again.");
        // stay on the factor stage so the user can correct the password/token
      } else {
        toastRef.current?.error?.(
          d?.message || "Failed to start 2FA setup",
          "Error",
          4000
        );
        setSetupStage(null);
      }
    } finally {
      setTwoFaBusy(false);
    }
  }, []);

  const start2FASetup = useCallback(async () => {
    setSetupFactorErr("");
    setSetupPassword("");
    setSetupTurnstileToken("");
    const method = twoFa.reauthMethod; // server-driven; null when flag off
    if (method === "password") {
      setSetupFactorKind("password");
      setSetupStage("factor");
      return;
    }
    if (method === "turnstile") {
      setSetupFactorKind("turnstile");
      setSetupStage("factor");
      // render the widget once the factor stage mounts
      return;
    }
    // no factor required -> go straight to QR (identical to the old flow)
    await runSetup({});
  }, [twoFa.reauthMethod, runSetup]);

  // Mount/teardown the Turnstile widget while on the turnstile factor stage.
  useEffect(() => {
    if (setupStage !== "factor" || setupFactorKind !== "turnstile") return;
    let cancelled = false;
    (async () => {
      const ts = await loadTurnstileScript();
      if (cancelled || !ts || !TS_SITEKEY || !turnstileElRef.current) {
        if (!cancelled)
          setSetupFactorErr(
            "Security check unavailable. Wire the Turnstile widget (sitekey) to enable 2FA for Google accounts in production."
          );
        return;
      }
      try {
        turnstileWidgetIdRef.current = ts.render(turnstileElRef.current, {
          sitekey: TS_SITEKEY,
          action: "2fa_setup",
          appearance: "interaction-only",
          callback: (token) => setSetupTurnstileToken(token),
          "expired-callback": () => setSetupTurnstileToken(""),
          "error-callback": () =>
            setSetupFactorErr("Security check failed. Reload and retry."),
        });
      } catch {
        setSetupFactorErr("Could not load the security check. Retry.");
      }
    })();
    return () => {
      cancelled = true;
      try {
        const ts = window.turnstile;
        if (ts && turnstileWidgetIdRef.current != null)
          ts.remove(turnstileWidgetIdRef.current);
      } catch {}
      turnstileWidgetIdRef.current = null;
    };
  }, [setupStage, setupFactorKind]);

  const submitSetupFactor = useCallback(() => {
    if (setupFactorKind === "password") {
      if (!setupPassword) {
        setSetupFactorErr("Enter your current password.");
        return;
      }
      runSetup({ password: setupPassword });
    } else if (setupFactorKind === "turnstile") {
      if (!setupTurnstileToken) {
        setSetupFactorErr("Complete the security check first.");
        return;
      }
      runSetup({ turnstileToken: setupTurnstileToken });
    }
  }, [setupFactorKind, setupPassword, setupTurnstileToken, runSetup]);

  const closeSetup = useCallback(() => {
    setSetupStage(null);
    setSetupData(null);
    setSetupFactorKind(null);
    setSetupFactorErr("");
  }, []);

  const confirm2FASetup = async () => {
    if (verifyCode.length !== 6) {
      toastRef.current?.error?.("Enter the 6-digit code", "Error", 3000);
      return;
    }
    setTwoFaBusy(true);
    try {
      const { data } = await api.post("/2fa/verify-setup", {
        totpCode: verifyCode,
      });
      closeSetup();
      setBackupCodes(data.backupCodes);
      loadSecurity();
    } catch (err) {
      toastRef.current?.error?.(
        err.response?.data?.message || "Invalid code",
        "Error",
        4000
      );
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
      toastRef.current?.success?.("2FA has been disabled", "Success", 3000);
      setDisableModal(false);
      setDisablePassword("");
      setDisableCode("");
      loadSecurity();
    } catch (err) {
      if (err.response?.data?.signatureExpired) {
        toastRef.current?.warning?.(
          "Request expired. Please try again.",
          "Session expired",
          5000
        );
        setTwoFaBusy(false);
        return;
      }
      toastRef.current?.error?.(
        err.response?.data?.message || "Failed to disable 2FA",
        "Error",
        4000
      );
    } finally {
      setTwoFaBusy(false);
    }
  };

  const revokeSession = async (id) => {
    if (!id || revokingRef.current.has(id)) return;
    revokingRef.current.add(id);
    setRevokingSessionId(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      toastRef.current?.success?.("Session revoked", "Success", 3000);
      setRevokeTarget(null);
      loadSecurity();
    } catch (err) {
      toastRef.current?.error?.(
        err.response?.data?.message || "Failed to revoke session",
        "Error",
        4000
      );
    } finally {
      revokingRef.current.delete(id);
      setRevokingSessionId(null);
    }
  };

  const revokeOthers = async () => {
    if (revokeOthersLoading) return;
    setRevokeOthersLoading(true);
    try {
      const { data } = await api.post("/auth/sessions/revoke-others");
      toastRef.current?.success?.(
        data?.sessionsRevoked
          ? `${data.sessionsRevoked} other session(s) revoked`
          : "All other sessions revoked",
        "Success",
        3000
      );
      setRevokeOthersConfirm(false);
      loadSecurity();
    } catch (err) {
      toastRef.current?.error?.(
        err.response?.data?.message || "Failed to revoke sessions",
        "Error",
        4000
      );
    } finally {
      setRevokeOthersLoading(false);
    }
  };

  const useModalFocusTrap = (isOpen, modalRef, initialFocusRef) => {
    useEffect(() => {
      if (!isOpen) return;
      const previousFocus = document.activeElement;
      setTimeout(() => initialFocusRef?.current?.focus(), 100);

      const handleKeyDown = (e) => {
        if (e.key === "Escape") {
          if (isOpen === "setup") closeSetup();
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
    }, [isOpen, modalRef, initialFocusRef, closeSetup]);
  };

  useModalFocusTrap(
    setupStage ? "setup" : null,
    setupModalRef,
    setupFactorKind === "password" ? null : verifyInputRef
  );
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
                  {otherDeviceCount > 0 && (
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
                    {sessions.map((s) => {
                      const label = deviceLabel(s);
                      return (
                        <div
                          key={s._id}
                          className="list-group-item d-flex justify-content-between align-items-center px-0"
                        >
                          <div>
                            <strong className="d-block small">
                              {label}
                              {s.isCurrentDevice && (
                                <span
                                  className="badge bg-success ms-2"
                                  aria-label="This device"
                                >
                                  <i
                                    className="bi bi-check-circle me-1"
                                    aria-hidden="true"
                                  ></i>
                                  This device
                                </span>
                              )}
                            </strong>
                            <small className="text-muted">
                              {s.lastIp} · Last active{" "}
                              <time dateTime={s.lastUsedAt}>
                                {new Date(s.lastUsedAt).toLocaleString()}
                              </time>
                            </small>
                          </div>
                          {s.isCurrentDevice ? (
                            <span
                              className="text-muted small"
                              aria-hidden="true"
                            >
                              —
                            </span>
                          ) : (
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => setRevokeTarget(s)}
                              disabled={revokingSessionId === s._id}
                              aria-label={`Revoke session on ${label}`}
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
                          )}
                        </div>
                      );
                    })}
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

      {/* ═══ 2FA SETUP MODAL (factor step -> QR step) ═══ */}
      {setupStage && (
        <div
          className="settings-modal-overlay"
          onClick={() => !twoFaBusy && closeSetup()}
        >
          <div
            ref={setupModalRef}
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-2fa-title"
            onClick={(e) => e.stopPropagation()}
          >
            {setupStage === "factor" ? (
              <div className="p-4 text-center">
                <h5 id="setup-2fa-title" className="fw-bold mb-2">
                  Confirm it's you
                </h5>
                <p className="text-muted small mb-3">
                  {setupFactorKind === "password"
                    ? "Enter your current password to start 2FA setup."
                    : "Complete the security check to start 2FA setup."}
                </p>

                {setupFactorKind === "password" && (
                  <input
                    id="setup-password"
                    type="password"
                    className="form-control mb-3"
                    placeholder="Current password"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={twoFaBusy}
                  />
                )}

                {setupFactorKind === "turnstile" && (
                  <div
                    ref={turnstileElRef}
                    className="d-flex justify-content-center mb-3"
                  />
                )}

                {setupFactorErr && (
                  <p className="text-danger small mb-3" role="alert">
                    {setupFactorErr}
                  </p>
                )}

                <div className="d-flex gap-2">
                  <button
                    className="btn btn-outline-secondary flex-fill"
                    onClick={closeSetup}
                    disabled={twoFaBusy}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary flex-fill"
                    onClick={submitSetupFactor}
                    disabled={
                      twoFaBusy ||
                      (setupFactorKind === "password" && !setupPassword) ||
                      (setupFactorKind === "turnstile" && !setupTurnstileToken)
                    }
                  >
                    {twoFaBusy ? "Checking..." : "Continue"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <h5 id="setup-2fa-title" className="fw-bold mb-3">
                  Scan with Authenticator App
                </h5>
                <img
                  src={setupData?.qrCode}
                  alt="2FA QR Code"
                  className="settings-qr-img"
                />
                <p className="text-muted small mt-3 mb-1">
                  Or enter this key manually:
                </p>
                <code className="d-block bg-light p-2 rounded mb-3 settings-secret-code">
                  {setupData?.secret || "—"}
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
                    onClick={closeSetup}
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
            )}
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
          deviceLabel(revokeTarget) || "Unknown"
        }. That device will need to log in again.`}
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
        message={`This will revoke ${otherDeviceCount} other session(s). You will remain logged in on this device.`}
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
