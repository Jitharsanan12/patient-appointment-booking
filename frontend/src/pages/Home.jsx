/*
  "/" shows different content depending on who's logged in:
  patients see the doctor list, doctors/admins get redirected to their
  own dashboard.
*/

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DoctorList from "./DoctorList";

export default function Home() {
  const { user } = useAuth();

  if (user?.role === "doctor") return <Navigate to="/doctor" replace />;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;

  return <DoctorList />;
}
