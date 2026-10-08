import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, Component } from "react"; // ✅ Component for the chunk error boundary

import { useAuth } from "./hooks/useAuth";
import Loader from "./components/Loader.jsx";
import Footer from "./components/Footer.jsx";
import Navbar from "./components/Navbar.jsx";
import { CallProvider } from "./context/CallContext.jsx"; // ✅ USED NOW
import ScrollToTop from "./components/ScrollToTop.jsx";
import InCallOverlay from "./components/InCallOverlay.jsx"; // ✅ CHANGED — the call UI itself (provider ≠ UI)

// Roles the backend treats as administrative (mirror of server/middleware/auth.middleware.js ADMIN_ROLES).
// NOTE: this is a UX/defense-in-depth mirror, NOT the security boundary. The server middleware is the
// wall; an attacker can fetch these admin chunks directly (they contain no secrets) and hit the admin
// API regardless of this guard. Keep this list in sync with the backend so the UI never offers an
// action the server will 403.
const ADMIN_ROLES = ["admin", "superadmin"];

// ═══════════════════════════════════════════
// EAGER IMPORTS — only public pages needed on first load
// ═══════════════════════════════════════════
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";

// ═══════════════════════════════════════════
// LAZY IMPORTS — everything else loaded on demand
// ═══════════════════════════════════════════

// Public (lazy)
const Suggestion = lazy(() => import("./pages/Suggestion.jsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const OAuthSuccess = lazy(() => import("./pages/OAuthSuccess.jsx"));
const About = lazy(() => import("./pages/About.jsx"));
const Safety = lazy(() => import("./pages/Safety.jsx"));
const SuccessStories = lazy(() => import("./pages/SuccessStories.jsx"));
const Blog = lazy(() => import("./pages/Blog.jsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.jsx"));
const SecurityPolicy = lazy(() => import("./pages/SecurityPolicy"));

// Protected (lazy)
const Profile = lazy(() => import("./pages/Profile"));
const EditProfile = lazy(() => import("./pages/EditProfile"));
const Discover = lazy(() => import("./pages/Discover"));
const Matches = lazy(() => import("./pages/Matches.jsx"));
const Messages = lazy(() => import("./pages/Messages.jsx"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Feed = lazy(() => import("./pages/Feed.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const SavedPosts = lazy(() => import("./pages/SavedPosts.jsx"));
const PostDetail = lazy(() => import("./pages/PostDetail.jsx"));

// Admin (lazy)
const AdminRoutes = lazy(() => import("./pages/admin/AdminRoutes.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const Users = lazy(() => import("./pages/admin/Users.jsx"));
const UserDetails = lazy(() => import("./pages/admin/UserDetails.jsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.jsx"));
const AdminSuggestions = lazy(() =>
  import("./pages/admin/AdminSuggestions.jsx")
);

// ═══════════════════════════════════════════
// CHUNK-LOAD ERROR BOUNDARY (deploy-race / stale-SW resilience + anti reload-loop)
// ---------------------------------------------------------------------
// A lazy() that REJECTS (hashed chunk 404 after a Vercel deploy, or a poisoned
// CDN response) throws during render; <Suspense> catches promises, NOT
// rejections, so without this the whole app white-screens. We hard-reload ONCE
// (time-decayed sessionStorage guard) to fetch the new index.html; if it still
// fails we stop and show a static fallback so we can never spin an infinite
// reload loop (itself a client-side DoS). Non-chunk render errors are NOT
// reloaded (so genuine bugs aren't masked).
// ═══════════════════════════════════════════
const CHUNK_RELOAD_KEY = "maya_chunk_reload_ts";
const CHUNK_RELOAD_COOLDOWN_MS = 15000;
const IS_DEV = import.meta.env?.DEV === true; // ✅ CHANGED — gate verbose stack logging

function isChunkLoadError(e) {
  const name = String(e?.name || "");
  const msg = String(e?.message || "");
  return (
    name === "ChunkLoadError" ||
    /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
      msg
    )
  );
}

function tryOnceReload() {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  } catch {}
  const now = Date.now();
  if (now - last > CHUNK_RELOAD_COOLDOWN_MS) {
    try {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    } catch {}
    window.location.reload();
    return true; // reloading now; render nothing meanwhile
  }
  return false; // already reloaded recently and still broken -> show fallback
}

function StaticFallback({ onReload }) {
  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
      role="alert"
    >
      <div style={{ fontSize: 40 }} aria-hidden="true">
        ⚠️
      </div>
      <h1 style={{ fontSize: 20, margin: 0 }}>Couldn’t load this page</h1>
      <p style={{ margin: 0, color: "#666", maxWidth: 420 }}>
        The app was just updated. Reload to get the latest version, or return
        home.
      </p>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={onReload}
          style={{
            appearance: "none",
            border: "none",
            cursor: "pointer",
            background: "#e91e63",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            padding: "11px 18px",
            borderRadius: 12,
          }}
        >
          Reload
        </button>
        <a
          href="/"
          style={{
            textDecoration: "none",
            border: "1px solid #ddd",
            color: "#333",
            fontWeight: 600,
            fontSize: 15,
            padding: "11px 16px",
            borderRadius: 12,
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}

class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { errored: false, chunk: false };
  }
  static getDerivedStateFromError(err) {
    return { errored: true, chunk: isChunkLoadError(err) };
  }
  componentDidCatch(err, info) {
    // ✅ CHANGED — never dump a full component stack to the console in production
    // (mild internal-structure disclosure to anyone with devtools; the user-facing
    // signal is the Sentry event / the fallback UI, not the stack). Dev keeps it.
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.error(
        "[App] render/chunk error:",
        err?.message || err,
        info?.componentStack
      );
    } else {
      // eslint-disable-next-line no-console
      console.error("[App] render/chunk error:", err?.message || err);
    }
  }
  handleReload = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {}
    window.location.reload();
  };
  render() {
    if (!this.state.errored) return this.props.children;
    if (this.state.chunk && tryOnceReload()) return null; // reloading
    return <StaticFallback onReload={this.handleReload} />;
  }
}

// ═══════════════════════════════════════════
// PROTECTED ROUTE GUARD  (UX / defense-in-depth — see ADMIN_ROLES note above)
// ═══════════════════════════════════════════
function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Loader
        full
        text="Checking authentication"
        subtitle="Just a moment..."
        icon="shield-lock-fill"
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // ✅ authenticated but profile not hydrated yet -> don't decide admin yet
  //    (otherwise a hard refresh of /admin would bounce an admin to /discover).
  if (adminOnly && !user) {
    return (
      <Loader
        full
        text="Loading profile"
        subtitle="Just a moment..."
        icon="person-badge-fill"
      />
    );
  }

  // ✅ mirror the backend admin set: BOTH "admin" and "superadmin" pass.
  if (adminOnly && !ADMIN_ROLES.includes(user?.role)) {
    return <Navigate to="/discover" replace />;
  }

  return children;
}

// ═══════════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════════
function App() {
  return (
    <BrowserRouter>
      {/* ✅ CallProvider must wrap the app so incoming calls ring on ANY page */}
      <CallProvider>
        <AppContent />
      </CallProvider>
    </BrowserRouter>
  );
}

function AppContent() {
  const location = useLocation();
  const hideFooter = location.pathname.startsWith("/messages");

  return (
    <>
      <ScrollToTop />
      <Navbar />

      {/* ✅ CHANGED — global call UI, mounted ONCE, OUTSIDE the error boundary and
          OUTSIDE <Suspense>: (a) outside Suspense so a ring paints even while a
          lazy page chunk is still loading; (b) outside the boundary so a page-chunk
          404 (deploy race) can NEVER tear down an active call. It is INSIDE
          CallProvider (AppContent is), so useCallContext() resolves. Do NOT also
          render it in any page (grep below) — double-mount = double remote stream
          = echo + the overlay's own "N instances" error. */}
      <InCallOverlay />

      {/* ✅ boundary OUTSIDE Suspense so a rejected lazy import is caught */}
      <ChunkErrorBoundary>
        <Suspense
          fallback={
            <Loader
              full
              text="Loading page"
              subtitle="Just a moment..."
              icon="arrow-clockwise"
            />
          }
        >
          <Routes>
            {/* ── PUBLIC (eager) ─────────────────────── */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ── PUBLIC (lazy) ──────────────────────── */}
            <Route path="/suggestion" element={<Suggestion />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/oauth-success" element={<OAuthSuccess />} />
            <Route path="/about" element={<About />} />
            <Route path="/safety" element={<Safety />} />
            <Route path="/success-stories" element={<SuccessStories />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/security-policy" element={<SecurityPolicy />} />

            {/* ── PROTECTED (lazy) ───────────────────── */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/edit"
              element={
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Navigate to="/profile" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/discover"
              element={
                <ProtectedRoute>
                  <Discover />
                </ProtectedRoute>
              }
            />
            <Route
              path="/matches"
              element={
                <ProtectedRoute>
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages"
              element={
                <ProtectedRoute>
                  <Messages />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:userId"
              element={
                <ProtectedRoute>
                  <UserProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/feed"
              element={
                <ProtectedRoute>
                  <Feed />
                </ProtectedRoute>
              }
            />
            <Route
              path="/saved"
              element={
                <ProtectedRoute>
                  <SavedPosts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/post/:postId"
              element={
                <ProtectedRoute>
                  <PostDetail />
                </ProtectedRoute>
              }
            />

            {/* ── ADMIN (lazy) ───────────────────────── */}
            {/* ✅ Defense-in-depth: App-level admin guard + AdminRoutes internal guard */}
            <Route
              element={
                <ProtectedRoute adminOnly>
                  <AdminRoutes />
                </ProtectedRoute>
              }
            >
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/users/:userId" element={<UserDetails />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/suggestions" element={<AdminSuggestions />} />
            </Route>

            {/* ── CATCH-ALL ──────────────────────────── */}
            <Route path="*" element={<NotFoundRedirect />} />
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>

      {!hideFooter && <Footer />}
    </>
  );
}

/**
 * Smart 404 handler: redirects authenticated users to discover,
 * unauthenticated users to home. Preserves intent via state.
 */
function NotFoundRedirect() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  return (
    <Navigate
      to={isAuthenticated ? "/discover" : "/"}
      replace
      state={{ notFoundFrom: location.pathname }}
    />
  );
}

export default App;
