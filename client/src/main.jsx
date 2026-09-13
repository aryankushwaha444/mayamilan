import React from "react";
import ReactDOM from "react-dom/client";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { HelmetProvider } from "react-helmet-async";
import { AlertProvider } from "./context/AlertContext.jsx";

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

import { AuthProvider } from "./context/AuthContext.jsx";
import SocketProvider from "./context/SocketContext.jsx";
import { useRealtimeAlerts } from "./hooks/useRealtimeAlerts"; // 👈 ADD
import { usePushSubscription } from "./hooks/usePushSubscription"; // 👈 ADD

// Service Worker registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/push-sw.js").catch(console.error);
  });
}

/* BRIDGE COMPONENT (mounts hooks that need context) */
function AlertsBridge() {
  useRealtimeAlerts(); // sound + banner + vibration when app open
  usePushSubscription(); // auto-subscribe push while session valid
  return null;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AlertProvider>
      <AuthProvider>
        <SocketProvider>
          <HelmetProvider>
            <AlertsBridge />
            <App />
          </HelmetProvider>
        </SocketProvider>
      </AuthProvider>
    </AlertProvider>
  </React.StrictMode>
);
