import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getCurrentUser } from "../../services/authService";

function AdminRoutes() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  const [status, setStatus] = useState("checking"); // checking | admin | denied | unauth

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      setStatus("unauth");
      return;
    }

    let active = true;

    const verify = async () => {
      try {
        const data = await getCurrentUser(); // fresh check every visit
        if (!active) return;
        setStatus(data?.user?.role === "admin" ? "admin" : "denied");
      } catch (error) {
        if (!active) return;
        setStatus(error?.response?.status === 401 ? "unauth" : "denied");
      }
    };

    verify();
    return () => {
      active = false;
    };
  }, [loading, isAuthenticated]);

  if (loading || status === "checking") {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary"></div>
      </div>
    );
  }

  if (status === "unauth") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "denied") {
    return <Navigate to="/" replace />;
  }

  // 👇 CHANGED: no AdminLayout → no sidebar, no duplicate topbar.
  // Admin pages now render inside the normal app shell (main Navbar only).
  return <Outlet />;
}

export default AdminRoutes;
