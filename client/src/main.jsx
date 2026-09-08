import React from "react";
import ReactDOM from "react-dom/client";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import "./styles/global.css";
import "./styles/navbar.css";
import "./styles/chat.css";
import "./styles/footer.css";
import "./styles/admin.css";

import App from "./App.jsx";

import { AuthProvider } from "./context/AuthContext.jsx";
import SocketProvider from "./context/SocketContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <App />
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>
);