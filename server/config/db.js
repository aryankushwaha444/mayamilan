import mongoose from "mongoose";

// ==================================================
// ENVIRONMENT VALIDATION
// ==================================================

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || "dating_portal";
const NODE_ENV = process.env.NODE_ENV || "development";
const STRICT_TRANSACTIONS = process.env.STRICT_TRANSACTIONS === "true";

const IS_PRODUCTION = NODE_ENV === "production";

if (!MONGO_URI || !MONGO_URI.trim()) {
  throw new Error("MONGO_URI environment variable is required");
}

if (!DB_NAME.trim()) {
  throw new Error("DB_NAME must not be empty");
}

// ==================================================
// CONNECTION CONFIGURATION
// ==================================================

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let connectPromise = null;
let transactionsSupported = false;

// ==================================================
// SAFE MONGODB TARGET
// ==================================================

/*
 * Never print:
 * - username
 * - password
 * - query parameters
 * - full MongoDB URI
 */
const getSafeMongoTarget = () => {
  try {
    const uri = new URL(MONGO_URI);

    return {
      protocol: uri.protocol,
      host: uri.host,
    };
  } catch {
    return {
      protocol: "mongodb",
      host: "[redacted]",
    };
  }
};

// ==================================================
// CONNECTION EVENT LISTENERS
// ==================================================

mongoose.connection.on("connected", () => {
  if (!IS_PRODUCTION) {
    const target = getSafeMongoTarget();

    console.info(
      `MongoDB connected. Host: ${target.host}; database: ${DB_NAME}`
    );
  }
});

mongoose.connection.on("disconnected", () => {
  if (!IS_PRODUCTION) {
    console.warn("MongoDB disconnected");
  }
});

mongoose.connection.on("error", (error) => {
  // Never log the MongoDB URI or credentials.
  console.error("MongoDB runtime error:", error?.name || "DatabaseError");
});

// ==================================================
// TRANSACTION CAPABILITY CHECK
// ==================================================

const probeTransactions = async () => {
  if (!mongoose.connection.db) {
    throw new Error("MongoDB connection is not ready");
  }

  const hello = await mongoose.connection.db.admin().command({
    hello: 1,
  });

  const isReplicaSet = Boolean(hello.setName);
  const isSharded = hello.msg === "isdbgrid";

  const supportsSessions = hello.logicalSessionTimeoutMinutes != null;

  transactionsSupported = (isReplicaSet || isSharded) && supportsSessions;

  // --------------------------------------------------
  // DEVELOPMENT: verify expected local replica set
  // --------------------------------------------------

  if (!IS_PRODUCTION && isReplicaSet) {
    console.info(`MongoDB replica set detected: ${hello.setName}`);

    if (hello.setName !== "rs0") {
      throw new Error(
        `Unexpected MongoDB replica set "${hello.setName}". Expected "rs0".`
      );
    }
  }

  // --------------------------------------------------
  // Transaction support
  // --------------------------------------------------

  if (transactionsSupported) {
    if (!IS_PRODUCTION) {
      console.info(
        `MongoDB transactions supported: ${
          isSharded ? "sharded cluster" : "replica set"
        }`
      );
    }

    return true;
  }

  console.error(
    "MongoDB transaction support is unavailable. " +
      "Use a replica set or sharded cluster for " +
      "transaction-dependent operations."
  );
  console.error(
    "🛠  Two consistent worlds — pick ONE (mixing them is what causes the boot crash / 500 loop):\n" +
      "   (A) Replica set (recommended, matches Atlas): start mongod --replSet rs0 + rs.initiate,\n" +
      "       set MONGO_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0, keep STRICT_TRANSACTIONS=true.\n" +
      "   (B) Standalone quick-boot: MONGO_URI=mongodb://127.0.0.1:27017 (no replicaSet) AND\n" +
      "       STRICT_TRANSACTIONS=false. WARNING: with (B), transaction routes such as\n" +
      "       DELETE /api/matches/:id (unmatch) return 500 unless the controller is transaction-optional."
  );

  if (STRICT_TRANSACTIONS) {
    throw new Error(
      "STRICT_TRANSACTIONS=true, but MongoDB transaction support is unavailable. " +
        "Choose World (A) replica set + ?replicaSet=rs0, or World (B) standalone + STRICT_TRANSACTIONS=false. " +
        "See the 🛠 hint above."
    );
  }

  return false;
};

// ==================================================
// CONNECT WITH RETRIES
// ==================================================

const connectWithRetry = async () => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await mongoose.connect(MONGO_URI, {
        dbName: DB_NAME,

        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,

        maxPoolSize: 10,
        minPoolSize: 0,

        autoIndex: !IS_PRODUCTION,
      });

      await probeTransactions();

      return mongoose.connection;
    } catch (error) {
      const message = error?.message || "";

      const isStrictTransactionFailure = message.includes(
        "STRICT_TRANSACTIONS=true"
      );

      const isUnexpectedReplicaSet = message.includes(
        "Unexpected MongoDB replica set"
      );

      /*
       * Do not repeatedly retry configuration errors.
       */
      if (isStrictTransactionFailure || isUnexpectedReplicaSet) {
        await mongoose.disconnect().catch(() => {});
        throw error;
      }

      // ------------------------------------------------
      // Final attempt
      // ------------------------------------------------

      if (attempt === MAX_RETRIES) {
        console.error(
          `MongoDB connection/initialization failed ` +
            `after ${MAX_RETRIES} attempts.`,
          error?.name || "DatabaseError"
        );

        await mongoose.disconnect().catch(() => {});

        throw new Error("Unable to initialize MongoDB");
      }

      // ------------------------------------------------
      // Retry
      // ------------------------------------------------

      if (!IS_PRODUCTION) {
        console.warn(
          `MongoDB attempt ${attempt}/${MAX_RETRIES} failed. ` +
            `Retrying in ${(RETRY_DELAY_MS * attempt) / 1000}s.`
        );
      }

      await mongoose.disconnect().catch(() => {});

      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error("MongoDB initialization failed");
};

// ==================================================
// SINGLE-FLIGHT CONNECTION WRAPPER
// ==================================================

const connectDB = () => {
  // Already connected
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  // Connection already in progress
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = connectWithRetry().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
};

// ==================================================
// TRANSACTION CAPABILITY ACCESSOR
// ==================================================

export const hasTransactionSupport = () => {
  return transactionsSupported;
};

// ==================================================
// GRACEFUL DATABASE SHUTDOWN
// ==================================================

export const closeDB = async () => {
  transactionsSupported = false;

  if (connectPromise) {
    await connectPromise.catch(() => {});
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

// ==================================================
// EXPORTS
// ==================================================

export default connectDB;
