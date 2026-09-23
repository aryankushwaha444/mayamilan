import { useEffect, useState, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getCurrentUser } from "../../services/authService";
import { useAlert } from "../../context/AlertContext";

function AdminRoutes() {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const toast = useAlert();

  const [status, setStatus] = useState("checking"); // checking | admin | denied | unauth
  const verifiedRef = useRef(false); // ✅ Cache: skip re-verification within session

  useEffect(() => {
    if (loading) return;

    // Not authenticated → redirect to login
    if (!isAuthenticated || !user) {
      setStatus("unauth");
      return;
    }

    // ✅ Already verified as admin this session → skip API call
    if (verifiedRef.current && user.role === "admin") {
      setStatus("admin");
      return;
    }

    // Client-side role check first (fast path)
    if (user.role !== "admin") {
      setStatus("denied");
      return;
    }

    let active = true;

    const verify = async () => {
      try {
        const data = await getCurrentUser();
        if (!active) return;

        if (data?.user?.role === "admin") {
          verifiedRef.current = true; // ✅ Cache successful verification
          setStatus("admin");
        } else {
          setStatus("denied");
        }
      } catch (error) {
        if (!active) return;
        setStatus(error?.response?.status === 401 ? "unauth" : "denied");
      }
    };

    verify();

    return () => {
      active = false;
    };
  }, [loading, isAuthenticated, user]);

  // ✅ Reset cache on logout so next login re-verifies
  useEffect(() => {
    if (!isAuthenticated) {
      verifiedRef.current = false;
    }
  }, [isAuthenticated]);

  if (loading || status === "checking") {
    return (
      <div
        className="min-vh-100 d-flex justify-content-center align-items-center"
        role="status"
      >
        <div className="spinner-border text-primary"></div>
        <span className="visually-hidden">Verifying admin access...</span>
      </div>
    );
  }

  if (status === "unauth") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (status === "denied") {
    // ✅ Show explanation before redirecting
    toast.error(
      "Access denied. Admin privileges required.",
      "Unauthorized",
      5000
    );
    return <Navigate to="/discover" replace />;
  }

  return <Outlet />;
}

export default AdminRoutes;
