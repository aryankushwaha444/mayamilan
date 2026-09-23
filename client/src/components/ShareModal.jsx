import { useEffect, useState, useRef, useCallback } from "react";
import { postService } from "../services/postService";
import { useAlert } from "../context/AlertContext";

function ShareModal({ post, onClose, onShared }) {
  const toast = useAlert();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const previousFocusRef = useRef(null);

  // ✅ Load share targets
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

  // ✅ Focus trap + Escape key + body scroll lock + restore focus
  useEffect(() => {
    // Store previously focused element
    previousFocusRef.current = document.activeElement;

    // Focus search input on open
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      // Escape closes modal
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap: keep Tab within modal
      if (e.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;

      // Restore focus to previously focused element
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [onClose]);

  const toggle = useCallback((id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const filtered = targets.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleShare = async () => {
    if (selected.length === 0) return;
    setSending(true);
    setError("");

    try {
      const res = await postService.sharePost(post._id, selected);

      // ✅ Success feedback before closing
      toast.success(
        `Shared with ${selected.length} ${
          selected.length === 1 ? "match" : "matches"
        }! 🎉`,
        "Post Shared",
        3000
      );

      onShared?.(res.sharedCount);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to share post";
      setError(msg);
      toast.error(msg, "Share Failed", 5000);
    } finally {
      setSending(false);
    }
  };

  const getAvatarUrl = (u) =>
    u.photos?.find((p) => p.isPrimary)?.url ||
    u.photos?.[0]?.url ||
    "/images/default-avatar.png";

  return (
    <div
      className="modal-backdrop-custom"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="share-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        aria-describedby="share-modal-hint"
        tabIndex={-1}
      >
        <header>
          <h3 id="share-modal-title">Share post</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share modal"
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </header>

        <p className="share-hint" id="share-modal-hint">
          <i className="bi bi-lock-fill" aria-hidden="true"></i> Only your
          matches can receive shared posts.
        </p>

        <input
          ref={searchInputRef}
          className="share-search"
          placeholder="Search matches…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search matches"
          autoComplete="off"
        />

        <div
          className="share-list"
          role="listbox"
          aria-label="Select matches to share with"
        >
          {loading && (
            <div className="feed-loader" aria-live="polite" aria-busy="true">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading matches...</span>
              </div>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="share-empty" role="status">
              <i className="bi bi-people" aria-hidden="true"></i>
              <p>
                {targets.length === 0
                  ? "No matches yet. Match with someone to share posts!"
                  : "No matches found."}
              </p>
            </div>
          )}

          {!loading &&
            filtered.map((u) => {
              const isSelected = selected.includes(u._id);
              const checkboxId = `share-checkbox-${u._id}`;

              return (
                <label
                  key={u._id}
                  className={`share-item ${isSelected ? "selected" : ""}`}
                  htmlFor={checkboxId}
                  role="option"
                  aria-selected={isSelected}
                >
                  <input
                    type="checkbox"
                    id={checkboxId}
                    checked={isSelected}
                    onChange={() => toggle(u._id)}
                    className="visually-hidden" // Hide default checkbox, use custom styling
                    aria-label={`Share with ${u.name}`}
                  />

                  {/* Custom checkbox visual */}
                  <span className="share-checkbox-custom" aria-hidden="true">
                    {isSelected && <i className="bi bi-check-lg"></i>}
                  </span>

                  <img
                    src={getAvatarUrl(u)}
                    alt=""
                    className="share-avatar"
                    loading="lazy"
                  />

                  <div className="share-item-info">
                    <strong>{u.name}</strong>
                    {u.isOnline && (
                      <span className="online-dot-text" aria-label="Active now">
                        <span
                          className="online-indicator"
                          aria-hidden="true"
                        ></span>
                        Active now
                      </span>
                    )}
                  </div>

                  {isSelected && (
                    <i
                      className="bi bi-check-circle-fill share-check"
                      aria-hidden="true"
                    ></i>
                  )}
                </label>
              );
            })}
        </div>

        {error && (
          <p className="share-error" role="alert" aria-live="assertive">
            <i className="bi bi-exclamation-circle-fill" aria-hidden="true"></i>
            {error}
          </p>
        )}

        <footer>
          <button
            type="button"
            className="btn btn-secondary w-50 me-2"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary w-50"
            disabled={selected.length === 0 || sending}
            onClick={handleShare}
            aria-busy={sending}
          >
            {sending ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                ></span>
                Sharing…
              </>
            ) : selected.length > 0 ? (
              `Share with ${selected.length} ${
                selected.length === 1 ? "match" : "matches"
              }`
            ) : (
              "Share"
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ShareModal;
