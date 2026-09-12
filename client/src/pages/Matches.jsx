import { useEffect, useState } from "react";
import MatchCard from "../components/MatchCard.jsx";
import { getMatches, deleteMatch } from "../services/matchService.js";
import { useAlert } from "../context/AlertContext";
import Loader from "../components/Loader.jsx";

function Matches() {
  const toast = useAlert();

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMatches = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getMatches();
      setMatches(data.matches || []);
    } catch (error) {
      console.error("Load matches error:", error);
      setError(error.response?.data?.message || "Unable to load your matches.");
      toast.error("Failed to load matches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  const handleUnmatch = async (matchId) => {
    try {
      await deleteMatch(matchId);
      setMatches((currentMatches) =>
        currentMatches.filter((match) => match._id !== matchId)
      );
      toast.success("Match removed successfully 💔");
    } catch (error) {
      console.error("Unmatch error:", error);
      toast.error(error.response?.data?.message || "Failed to remove match.");
    }
  };

  if (loading) {
    return (
      <main className="matches-page">
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
    );
  }

  if (error) {
    return (
      <main className="matches-page">
        <div className="matches-container">
          <h1>Your Matches</h1>
          <div className="matches-error">
            <p>{error}</p>
            <button type="button" onClick={loadMatches}>
              Try Again
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="matches-page">
      <div className="matches-container">
        <div className="matches-header">
          <div>
            <h1>Your Matches</h1>
            <p>People who liked you back.</p>
          </div>
          <span className="matches-count">
            {matches.length} {matches.length === 1 ? "Match" : "Matches"}
          </span>
        </div>

        {matches.length === 0 ? (
          <div className="no-matches">
            <div className="no-matches-icon">💕</div>
            <h2>No matches yet</h2>
            <p>Keep discovering people and connecting with someone special.</p>
          </div>
        ) : (
          <div className="matches-grid">
            {matches.map((match) => (
              <MatchCard
                key={match._id}
                match={match}
                onUnmatch={handleUnmatch}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default Matches;
