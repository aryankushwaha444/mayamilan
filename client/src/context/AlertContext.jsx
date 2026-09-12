import { createContext, useContext, useState, useCallback } from "react";

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);

  const showAlert = useCallback(
    ({ type = "info", title, message, duration = 4000 }) => {
      const id = Date.now() + Math.random();
      const newAlert = { id, type, title, message, duration };

      setAlerts((prev) => [...prev, newAlert]);

      if (duration > 0) {
        setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a.id !== id));
        }, duration);
      }

      return id;
    },
    []
  );

  const removeAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Convenient shortcuts
  const success = (message, title = "Success") =>
    showAlert({ type: "success", title, message });
  const error = (message, title = "Error", duration = 6000) =>
    showAlert({ type: "error", title, message, duration });
  const warning = (message, title = "Warning") =>
    showAlert({ type: "warning", title, message });
  const info = (message, title = "Info") =>
    showAlert({ type: "info", title, message });

  return (
    <AlertContext.Provider
      value={{ showAlert, removeAlert, success, error, warning, info }}
    >
      {children}
      <AlertContainer alerts={alerts} onRemove={removeAlert} />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlert must be used within AlertProvider");
  return context;
}

function AlertContainer({ alerts, onRemove }) {
  if (alerts.length === 0) return null;

  return (
    <div className="alert-container">
      {alerts.map((alert) => (
        <AlertToast
          key={alert.id}
          alert={alert}
          onClose={() => onRemove(alert.id)}
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

function AlertToast({ alert, onClose }) {
  return (
    <div className={`alert-toast alert-${alert.type}`}>
      <div className="alert-icon">
        <i className={`bi ${ICONS[alert.type]}`}></i>
      </div>
      <div className="alert-body">
        <div className="alert-title">{alert.title}</div>
        {alert.message && <div className="alert-message">{alert.message}</div>}
      </div>
      <button className="alert-close" onClick={onClose} aria-label="Close">
        <i className="bi bi-x-lg"></i>
      </button>
      <div className="alert-progress"></div>
    </div>
  );
}
