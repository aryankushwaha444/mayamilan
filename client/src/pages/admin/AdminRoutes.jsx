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
  const toastedRef = useRef(false); // ✅ fire the denial toast at most once per denial

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !user) {
      setStatus("unauth");
      return;
    }
    if (verifiedRef.current && user.role === "admin") {
      setStatus("admin");
      return;
    }
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
          verifiedRef.current = true;
          setStatus("admin");
        } else setStatus("denied");
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

  // ✅ Reset cache + toast guard on logout so next login re-verifies / re-toasts
  useEffect(() => {
    if (!isAuthenticated) {
      verifiedRef.current = false;
      toastedRef.current = false;
    }
  }, [isAuthenticated]);

  // ✅ SIDE-EFFECT OUT OF RENDER (was toast.error() inside the `if (status==="denied")` body)
  useEffect(() => {
    if (status === "denied" && !toastedRef.current) {
      toastedRef.current = true;
      toast.error(
        "Access denied. Admin privileges required.",
        "Unauthorized",
        5000
      );
    }
  }, [status, toast]);

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
  if (status === "unauth")
    return <Navigate to="/login" replace state={{ from: location }} />;
  if (status === "denied") return <Navigate to="/discover" replace />;
  return <Outlet />;
}

export default AdminRoutes;
