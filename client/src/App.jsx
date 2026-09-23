import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense } from "react";

import { useAuth } from "./hooks/useAuth";
import Loader from "./components/Loader.jsx";
import Footer from "./components/Footer.jsx";
import Navbar from "./components/Navbar.jsx";
import ScrollToTop from "./components/ScrollToTop";

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

// Protected (lazy — ✅ moved from eager)
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
// PROTECTED ROUTE GUARD
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
    // ✅ Preserve full path + query params for post-login redirect
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (adminOnly && user?.role !== "admin") {
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
      <AppContent />
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

      {/* ✅ Semantic main landmark wrapping all route content */}
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
          <Route element={<AdminRoutes />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/users/:userId" element={<UserDetails />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            {/* ✅ Removed redundant ProtectedRoute — AdminRoutes already guards */}
            <Route path="/admin/suggestions" element={<AdminSuggestions />} />
          </Route>

          {/* ── CATCH-ALL ──────────────────────────── */}
          <Route path="*" element={<NotFoundRedirect />} />
        </Routes>
      </Suspense>

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
