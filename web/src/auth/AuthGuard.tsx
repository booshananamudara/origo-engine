import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
