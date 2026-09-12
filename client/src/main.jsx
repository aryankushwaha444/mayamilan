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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AlertProvider> 
    <AuthProvider>
      <SocketProvider>
        <HelmetProvider>
        <App />
        </HelmetProvider>
      </SocketProvider>
    </AuthProvider>
    </AlertProvider> 
  </React.StrictMode>
);