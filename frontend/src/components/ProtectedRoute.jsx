/*
  Wraps a page and only renders it if the user is logged in (and, if
  `role` is given, only if their role matches). Otherwise redirects.
  Usage in App.jsx:
    <ProtectedRoute role="patient"><MyAppointments /></ProtectedRoute>
*/

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;

  return children;
}
