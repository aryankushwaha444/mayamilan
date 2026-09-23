import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to your error tracking service (Sentry, LogRocket, etc.)
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught:", error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="d-flex align-items-center justify-content-center min-vh-100 p-4 text-center">
          <div style={{ maxWidth: 480 }}>
            <i className="bi bi-exclamation-triangle-fill display-3 text-warning mb-3"></i>
            <h2 className="fw-bold mb-2">Something went wrong</h2>
            <p className="text-muted mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              type="button"
              className="btn btn-primary px-4"
              onClick={this.handleReset}
            >
              Try Again
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary px-4 ms-2"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
