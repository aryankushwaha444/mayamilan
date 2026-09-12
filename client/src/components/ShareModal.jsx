import { useEffect, useState } from "react";
import { postService } from "../services/postService";

function ShareModal({ post, onClose, onShared }) {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await postService.getShareTargets();
        setTargets(res.users || []);
      } catch (err) {
        setError("Failed to load your matches");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const filtered = targets.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleShare = async () => {
    if (selected.length === 0) return;
    setSending(true);
    setError("");
    try {
      const res = await postService.sharePost(post._id, selected);
      onShared?.(res.sharedCount); // tell parent the new count
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to share post");
    } finally {
      setSending(false);
    }
  };

  const avatar = (u) =>
    u.photos?.find((p) => p.isPrimary)?.url ||
    u.photos?.[0]?.url ||
    "/images/default-avatar.png";

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Share post</h3>
          <button onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        <p className="share-hint">
          <i className="bi bi-lock-fill"></i> Only your matches can receive
          shared posts.
        </p>

        <input
          className="share-search"
          placeholder="Search matches…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="share-list">
          {loading && (
            <div className="feed-loader">
              <div className="spinner-border text-primary"></div>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="share-empty">
              <i className="bi bi-people"></i>
              <p>
                {targets.length === 0
                  ? "No matches yet. Match with someone to share posts!"
                  : "No matches found."}
              </p>
            </div>
          )}

          {filtered.map((u) => (
            <label
              key={u._id}
              className={`share-item ${
                selected.includes(u._id) ? "selected" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(u._id)}
                onChange={() => toggle(u._id)}
              />
              <img src={avatar(u)} alt="" />
              <div className="share-item-info">
                <strong>{u.name}</strong>
                {u.isOnline && (
                  <span className="online-dot-text">Active now</span>
                )}
              </div>
              {selected.includes(u._id) && (
                <i className="bi bi-check-circle-fill share-check"></i>
              )}
            </label>
          ))}
        </div>

        {error && <p className="share-error">{error}</p>}

        <footer>
          <button
            className="btn btn-primary w-100"
            disabled={selected.length === 0 || sending}
            onClick={handleShare}
          >
            {sending
              ? "Sharing…"
              : selected.length > 0
              ? `Share with ${selected.length} ${
                  selected.length === 1 ? "match" : "matches"
                }`
              : "Share"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ShareModal;
