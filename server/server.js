import dotenv from "dotenv";

dotenv.config();

import http from "http";

import app from "./app.js";
import connectDB from "./config/db.js";
import initializeSocket from "./sockets/socket.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);

    /*
     * Initialize Socket.io
     */
    initializeSocket(server);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup error:", error);

    process.exit(1);
  }
};

startServer();
