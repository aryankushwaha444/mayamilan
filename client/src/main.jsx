import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import "./styles/global.css";
import "./styles/navbar.css";
import "./styles/chat.css";
import "./styles/footer.css";
import "./styles/admin.css";
import "./styles/content.css";
import "./styles/feed.css";
import "./styles/alert.css";
import "./styles/loader.css";

import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AlertProvider } from "./context/AlertContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import SocketProvider from "./context/SocketContext.jsx";
import { useRealtimeAlerts } from "./hooks/useRealtimeAlerts";
import { usePushSubscription } from "./hooks/usePushSubscription";

// ═══════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// ═══════════════════════════════════════════
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Only register on production builds
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/push-sw.js").catch(() => {
        // Silent failure — push is optional, not critical
      });
    }
  });
}

// ═══════════════════════════════════════════
// BRIDGE COMPONENT
// Must be INSIDE all providers so hooks have access to
// auth state, socket connection, and alert context.
// Renders nothing — only mounts side-effect hooks.
// ═══════════════════════════════════════════
function AlertsBridge() {
  useRealtimeAlerts();
  usePushSubscription();
  return null;
}

// ═══════════════════════════════════════════
// ROOT RENDER
// ═══════════════════════════════════════════
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <HelmetProvider>
      <AlertProvider>
        <AuthProvider>
          <SocketProvider>
            {/* ✅ Bridge inside all providers, before App */}
            <AlertsBridge />
            <App />
          </SocketProvider>
        </AuthProvider>
      </AlertProvider>
    </HelmetProvider>
  </ErrorBoundary>
);
