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
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";
import Discover from "./pages/Discover";
import Matches from "./pages/Matches.jsx";
import Messages from "./pages/Messages.jsx";
import Footer from "./components/Footer.jsx";
import Navbar from "./components/Navbar.jsx";
import UserProfile from "./pages/UserProfile";
import Notifications from "./pages/Notifications";
import Feed from "./pages/Feed.jsx";
import ScrollToTop from "./components/ScrollToTop";

// LAZY IMPORTS (loaded on demand — shrinks initial bundle)
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const Suggestion = lazy(() => import("./pages/Suggestion.jsx"));
const OAuthSuccess = lazy(() => import("./pages/OAuthSuccess.jsx"));
const About = lazy(() => import("./pages/About.jsx"));
const Safety = lazy(() => import("./pages/Safety.jsx"));
const SuccessStories = lazy(() => import("./pages/SuccessStories.jsx"));
const Blog = lazy(() => import("./pages/Blog.jsx"));
const BlogPost = lazy(() => import("./pages/BlogPost.jsx"));
const SavedPosts = lazy(() => import("./pages/SavedPosts.jsx"));
const PostDetail = lazy(() => import("./pages/PostDetail.jsx"));

// Admin — lazy (most users never visit)
const AdminRoutes = lazy(() => import("./pages/admin/AdminRoutes.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.jsx"));
const Users = lazy(() => import("./pages/admin/Users.jsx"));
const UserDetails = lazy(() => import("./pages/admin/UserDetails.jsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.jsx"));
const AdminSuggestions = lazy(() =>
  import("./pages/admin/AdminSuggestions.jsx")
);

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
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && user?.role !== "admin") {
    return <Navigate to="/discover" replace />;
  }

  return children;
}

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

      {/* Suspense wraps Routes — shows Loader while lazy pages load */}
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
          {/* PUBLIC (eager) */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* PUBLIC (lazy — loaded on demand) */}
          <Route path="/suggestion" element={<Suggestion />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/oauth-success" element={<OAuthSuccess />} />
          <Route path="/about" element={<About />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/success-stories" element={<SuccessStories />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />

          {/* PROTECTED (any logged-in user) */}
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

          {/* ADMIN ONLY (lazy — most users never visit) */}
          <Route element={<AdminRoutes />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<Users />} />
            <Route path="/admin/users/:userId" element={<UserDetails />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route
              path="/admin/suggestions"
              element={
                <ProtectedRoute adminOnly>
                  <AdminSuggestions />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* UNKNOWN */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {!hideFooter && <Footer />}
    </>
  );
}

export default App;
