import { useEffect, useState, useCallback } from "react";
import MatchCard from "../components/MatchCard.jsx";
import { getMatches, deleteMatch } from "../services/matchService.js";
import { useAlert } from "../context/AlertContext";
import { useSocket } from "../hooks/useSocket.js";
import Loader from "../components/Loader.jsx";
import SEO from "../components/SEO";

function Matches() {
  const toast = useAlert();
  const { socket } = useSocket();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ✅ Stable load function with useCallback
  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getMatches();
      setMatches(data.matches || []);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load your matches.");
      toast.error("Failed to load matches", "Error", 4000);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ✅ Correct dependency array
  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // ✅ Real-time socket sync for matches
  useEffect(() => {
    if (!socket) return;

    const handleNewMatch = ({ match }) => {
      if (!match) return;
      setMatches((prev) => {
        if (prev.some((m) => m._id === match._id)) return prev;
        return [match, ...prev];
      });
      toast.success("You have a new match! 💕", "New Match", 4000);
    };

    const handleMatchRemoved = ({ matchId }) => {
      setMatches((prev) => prev.filter((m) => m._id !== matchId));
    };

    socket.on("new_match", handleNewMatch);
    socket.on("match_removed", handleMatchRemoved);

    return () => {
      socket.off("new_match", handleNewMatch);
      socket.off("match_removed", handleMatchRemoved);
    };
  }, [socket, toast]);

  const handleUnmatch = async (matchId) => {
    // ✅ Optimistic removal
    const previousMatches = [...matches];
    setMatches((prev) => prev.filter((m) => m._id !== matchId));

    try {
      await deleteMatch(matchId);
      toast.success("Match removed successfully 💔", "Unmatched", 3000);
    } catch (err) {
      // Revert on failure
      setMatches(previousMatches);
      toast.error(
        err.response?.data?.message || "Failed to remove match.",
        "Error",
        4000
      );
    }
  };

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
