import mongoose from "mongoose";
import { hasTransactionSupport } from "../config/db.js";

/**
 * Atomic on a replica set / mongos (i.e. Atlas, always). Sequential-with-warning
 * on a local standalone. The body is identical either way: it receives `session`
 * (a ClientSession or null) and passes it to its queries; Mongoose runs each op
 * without a session when it's null, so the same lines degrade correctly.
 *
 * Safe to call hasTransactionSupport() synchronously because db.js computes it
 * during connect (awaited before server.listen), so it is final before any request.
 */
export const runAtomic = async (
  fn,
  { retries = 3, label = "operation" } = {}
) => {
  if (!hasTransactionSupport()) {
    console.warn(
      `⚠️ [transaction] standalone — "${label}" running NON-atomically ` +
        `(dev only; on Atlas this same code is fully atomic).`
    );
    return fn(null);
  }

  const session = mongoose.startSession();
  try {
    let attempt = 0;
    for (;;) {
      try {
        let out;
        await session.withTransaction(
          async () => {
            out = await fn(session);
          },
          {
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
            readPreference: "primary",
          }
        );
        return out;
      } catch (err) {
        // withTransaction already retries TransientTransactionError internally.
        // We only re-run when the COMMIT outcome is unknown (spec-mandated retry).
        if (
          !err?.hasErrorLabel?.("UnknownTransactionCommitResult") ||
          ++attempt >= retries
        ) {
          throw err;
        }
      }
    }
  } finally {
    await session.endSession();
  }
};
