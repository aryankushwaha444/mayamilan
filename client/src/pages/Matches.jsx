import { useEffect, useState, useCallback, useRef } from "react";
import MatchCard from "../components/MatchCard.jsx";
import { getMatches, deleteMatch } from "../services/matchService.js";
import { useAlert } from "../context/AlertContext";
import { useSocket } from "../hooks/useSocket.js";
import Loader from "../components/Loader.jsx";
import SEO from "../components/SEO";

function Matches() {
  const toast = useAlert();
  const { socket } = useSocket();

  // ✅ toast mirrored to a ref → loaders/socket handlers can have [] / [socket]
  // deps and never re-create on an unstable toast (the original loop trigger).
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // request-id guard: only the newest fetch may commit state (kills stale races)
  const reqIdRef = useRef(0);

  // ✅ Stable loader: [] deps, reads toast via ref, applies only latest response
  const loadMatches = useCallback(async () => {
    const id = ++reqIdRef.current;
    try {
      if (id === reqIdRef.current) setLoading(true);
      setError("");
      const data = await getMatches();
      if (id !== reqIdRef.current) return; // a newer request superseded this one
      setMatches(Array.isArray(data?.matches) ? data.matches : []);
    } catch (err) {
      if (id !== reqIdRef.current) return;
      setError(err.response?.data?.message || "Unable to load your matches.");
      toastRef.current?.error?.("Failed to load matches", "Error", 2000);
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, []);

  // loadMatches is stable ([]), so this runs exactly once on mount.
  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // ✅ Real-time socket sync — depends on [socket] ONLY; toast via ref (was [socket, toast] → churn)
  useEffect(() => {
    if (!socket) return;

    const handleNewMatch = ({ match }) => {
      if (!match?._id) return;
      setMatches((prev) =>
        prev.some((m) => m._id === match._id) ? prev : [match, ...prev]
      );
      toastRef.current?.success?.(
        "You have a new match! 💕",
        "New Match",
        2000
      );
    };

    const handleMatchRemoved = ({ matchId }) => {
      if (!matchId) return;
      setMatches((prev) => prev.filter((m) => m._id !== matchId));
    };

    socket.on("new_match", handleNewMatch);
    socket.on("match_removed", handleMatchRemoved);

    return () => {
      socket.off("new_match", handleNewMatch);
      socket.off("match_removed", handleMatchRemoved);
    };
  }, [socket]);

  // ✅ Double-submit guard: a rapid second click can't fire a second DELETE
  const unmatchingRef = useRef(new Set());
  const handleUnmatch = useCallback(async (matchId) => {
    if (!matchId || unmatchingRef.current.has(matchId)) return;
    unmatchingRef.current.add(matchId);

    setMatches((prev) => {
      const previous = prev;
      // stash for revert without closing over a stale `matches`
      prev._previousSnapshot = previous;
      return previous.filter((m) => m._id !== matchId);
    });
    const snapshot = (() => {
      // capture current list synchronously before await
      let cap = null;
      setMatches((p) => {
        cap = p;
        return p;
      });
      return cap;
    })();

    try {
      await deleteMatch(matchId);
      toastRef.current?.success?.(
        "Match removed successfully 💔",
        "Unmatched",
        2000
      );
    } catch (err) {
      if (snapshot) setMatches(snapshot); // revert on failure
      toastRef.current?.error?.(
        err.response?.data?.message || "Failed to remove match.",
        "Error",
        2000
      );
    } finally {
      unmatchingRef.current.delete(matchId);
    }
  }, []);

  // ═══════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════
  if (loading) {
    return (
      <>
        <SEO
          title="My Matches"
          description="See who liked you back on Maya Milan."
          path="/matches"
          noIndex
        />
        <main className="matches-page" id="main-content">
          <div className="matches-container">
            <h1>Your Matches</h1>
            <Loader
              full
              text="Finding your matches"
              subtitle="People who liked you back"
              icon="heart-fill"
            />
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // ERROR STATE
  // ═══════════════════════════════════════
  if (error) {
    return (
      <>
        <SEO
          title="My Matches"
          description="See who liked you back on Maya Milan."
          path="/matches"
          noIndex
        />
        <main className="matches-page" id="main-content">
          <div className="matches-container">
            <h1>Your Matches</h1>
            <div className="matches-error" role="alert">
              <i
                className="bi bi-exclamation-triangle-fill fs-1 text-danger mb-3"
                aria-hidden="true"
              ></i>
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-primary mt-2"
                onClick={loadMatches}
              >
                <i
                  className="bi bi-arrow-clockwise me-2"
                  aria-hidden="true"
                ></i>
                Try Again
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ═══════════════════════════════════════
  // MAIN VIEW
  // ═══════════════════════════════════════
  return (
    <>
      <SEO
        title={`My Matches (${matches.length}) — Maya Milan`}
        description="See who liked you back on Maya Milan. Start chatting with your matches today."
        path="/matches"
        noIndex
      />

      <main className="matches-page" id="main-content">
        <div className="matches-container">
          <div className="matches-header">
            <div>
              <h1>Your Matches</h1>
              <p>People who liked you back.</p>
            </div>
            <div className="d-flex align-items-center gap-3">
              <span className="matches-count" aria-live="polite">
                {matches.length} {matches.length === 1 ? "Match" : "Matches"}
              </span>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={loadMatches}
                disabled={loading}
                aria-label="Refresh matches"
                title="Refresh"
              >
                <i
                  className={`bi bi-arrow-clockwise ${
                    loading ? "spin-animation" : ""
                  }`}
                  aria-hidden="true"
                ></i>
              </button>
            </div>
          </div>

          {matches.length === 0 ? (
            <div className="no-matches" role="status">
              <div className="no-matches-icon" aria-hidden="true">
                💕
              </div>
              <h2>No matches yet</h2>
              <p>
                Keep discovering people and connecting with someone special.
              </p>
            </div>
          ) : (
            <div className="matches-grid" role="list" aria-label="Your matches">
              {matches.map((match) => (
                <div key={match._id} role="listitem">
                  <MatchCard match={match} onUnmatch={handleUnmatch} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export default Matches;
