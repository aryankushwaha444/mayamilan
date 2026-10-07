import ReactDOM from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";

// ── Vendor CSS first (bundled from node_modules, NOT a CDN <link>) ──
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

// ── App CSS, imported via JS in the SAME cascade order main.css used to
//    express with @import, so Vite/Rollup preserves it deterministically in
//    the production build (fixes the dev-vs-build order divergence that made
//    Bootstrap's .dropdown-header{display:block} beat your display:flex on prod).
//    utilities.css stays LAST so it can still override everything, as intended.
import "./styles/base/variables.css";
import "./styles/base/reset.css";
import "./styles/base/animations.css";

import "./styles/layout/navbar.css";
import "./styles/layout/footer.css";
import "./styles/layout/admin-layout.css";

import "./styles/components/loader.css";
import "./styles/components/alerts.css";
import "./styles/components/confirm-dialog.css";
import "./styles/components/lightbox.css";
import "./styles/components/share-modal.css";

import "./styles/pages/home.css";
import "./styles/pages/auth.css";
import "./styles/pages/profile.css";
import "./styles/pages/discovery.css";
import "./styles/pages/matches.css";
import "./styles/pages/feed.css";
import "./styles/pages/messages.css";
import "./styles/pages/admin.css";
import "./styles/pages/blog.css";
import "./styles/pages/settings.css";
import "./styles/pages/suggestion.css";
import "./styles/pages/call.css";

import "./styles/utils/datepicker.css";
import "./styles/utils/utilities.css";

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
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/push-sw.js").catch(() => {
        // Silent failure — push is optional, not critical
      });
    }
  });
}

// ═══════════════════════════════════════════
// BRIDGE COMPONENT
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
            <AlertsBridge />
            <App />
          </SocketProvider>
        </AuthProvider>
      </AlertProvider>
    </HelmetProvider>
  </ErrorBoundary>
);
