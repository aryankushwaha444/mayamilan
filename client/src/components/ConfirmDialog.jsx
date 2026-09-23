import { useEffect, useRef, useCallback } from "react";

function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  icon = "bi-question-circle-fill",
  onConfirm,
  onCancel,
  loading = false, // ✅ NEW: Loading state for async operations
}) {
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const previousFocusRef = useRef(null);

  // ✅ Focus trap + initial focus + restore focus on close
  useEffect(() => {
    if (!open) return;

    // Store previously focused element
    previousFocusRef.current = document.activeElement;

    // Focus the dialog (or confirm button for danger dialogs)
    setTimeout(() => {
      if (danger && confirmButtonRef.current) {
        confirmButtonRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 0);

    // Focus trap: keep Tab within dialog
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: go to last element if at first
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: go to first element if at last
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Prevent body scroll when dialog is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;

      // Restore focus to previously focused element
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, danger, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-backdrop" onClick={onCancel} role="presentation">
      <div
        className={`confirm-dialog ${danger ? "danger" : ""}`}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        tabIndex={-1}
      >
        <div
          className={`confirm-icon ${danger ? "danger" : ""}`}
          aria-hidden="true"
        >
          <i className={`bi ${icon}`}></i>
        </div>

        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>

        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-cancel"
            onClick={onCancel}
            disabled={loading}
            autoFocus={!danger}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-ok ${danger ? "danger" : ""}`}
            onClick={onConfirm}
            disabled={loading}
            ref={confirmButtonRef}
            autoFocus={danger}
          >
            {loading ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  aria-hidden="true"
                ></span>
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
