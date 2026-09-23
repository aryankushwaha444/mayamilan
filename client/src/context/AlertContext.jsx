import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const timersRef = useRef({});

  const removeAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const showAlert = useCallback(
    ({ type = "info", title, message, duration = 4000 }) => {
      // ✅ Use crypto.randomUUID() for guaranteed unique IDs
      const id = crypto.randomUUID();
      const newAlert = { id, type, title, message, duration };

      setAlerts((prev) => [...prev, newAlert]);

      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => {
          removeAlert(id);
        }, duration);
      }

      return id;
    },
    [removeAlert]
  );

  // ✅ Pause timer on hover
  const pauseAlert = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  // ✅ Resume timer on mouse leave
  const resumeAlert = useCallback(
    (id, duration) => {
      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => {
          removeAlert(id);
        }, duration); // Note: In a perfect world, you'd calculate remaining time. For simplicity, we restart the timer.
      }
    },
    [removeAlert]
  );

  // ✅ Cleanup all timers on unmount
  useEffect(() => {
    const currentTimers = timersRef.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  // Convenient shortcuts
  const success = (message, title = "Success", duration = 4000) =>
    showAlert({ type: "success", title, message, duration });
  const error = (message, title = "Error", duration = 6000) =>
    showAlert({ type: "error", title, message, duration });
  const warning = (message, title = "Warning", duration = 5000) =>
    showAlert({ type: "warning", title, message, duration });
  const info = (message, title = "Info", duration = 4000) =>
    showAlert({ type: "info", title, message, duration });

  return (
    <AlertContext.Provider
      value={{ showAlert, removeAlert, success, error, warning, info }}
    >
      {children}
      <AlertContainer
        alerts={alerts}
        onRemove={removeAlert}
        onPause={pauseAlert}
        onResume={resumeAlert}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlert must be used within AlertProvider");
  return context;
}

function AlertContainer({ alerts, onRemove, onPause, onResume }) {
  if (alerts.length === 0) return null;

  return (
    // ✅ Added ARIA live region for screen readers
    <div className="alert-container" aria-live="polite" aria-atomic="false">
      {alerts.map((alert) => (
        <AlertToast
          key={alert.id}
          alert={alert}
          onClose={() => onRemove(alert.id)}
          onMouseEnter={() => onPause(alert.id)}
          onMouseLeave={() => onResume(alert.id, alert.duration)}
        />
      ))}
    </div>
  );
}

const ICONS = {
  success: "bi-check-circle-fill",
  error: "bi-x-circle-fill",
  warning: "bi-exclamation-triangle-fill",
  info: "bi-info-circle-fill",
};

function AlertToast({ alert, onClose, onMouseEnter, onMouseLeave }) {
  return (
    <div
      className={`alert-toast alert-${alert.type}`}
      role="alert"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="alert-icon">
        <i className={`bi ${ICONS[alert.type]}`} aria-hidden="true"></i>
      </div>
      <div className="alert-body">
        <div className="alert-title">{alert.title}</div>
        {alert.message && <div className="alert-message">{alert.message}</div>}
      </div>
      <button
        className="alert-close"
        onClick={onClose}
        aria-label="Dismiss notification"
        type="button"
      >
        <i className="bi bi-x-lg" aria-hidden="true"></i>
      </button>

      {/* ✅ Animated progress bar */}
      {alert.duration > 0 && (
        <div
          className="alert-progress"
          style={{ animationDuration: `${alert.duration}ms` }}
        ></div>
      )}
    </div>
  );
}
