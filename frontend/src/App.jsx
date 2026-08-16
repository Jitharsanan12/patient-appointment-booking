import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MyAppointments from "./pages/MyAppointments";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorSettings from "./pages/DoctorSettings";
import AdminDashboard from "./pages/AdminDashboard";
import AdminDoctors from "./pages/AdminDoctors";
import AdminPatients from "./pages/AdminPatients";
import ChangePassword from "./pages/ChangePassword";
import MyProfile from "./pages/MyProfile";

// Routes whose own page design replaces the navbar (the Login/Register
// cards already have their own logo + heading — showing the navbar too
// would be redundant). Kept as a small explicit list rather than e.g. a
// route param, since it's just these two pages and unlikely to grow.
const NAVBAR_HIDDEN_ROUTES = ["/login", "/register"];

// Needs to be a component rendered INSIDE <BrowserRouter> (not App itself)
// so it can call useLocation() to know the current path.
function AppLayout() {
  const location = useLocation();
  const showNavbar = !NAVBAR_HIDDEN_ROUTES.includes(location.pathname);

  return (
    <>
      {showNavbar && <Navbar />}
      <main className="container">
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/my-appointments"
            element={
              <ProtectedRoute role="patient">
                <MyAppointments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute role="doctor">
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor/settings"
            element={
              <ProtectedRoute role="doctor">
                <DoctorSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/doctors"
            element={
              <ProtectedRoute role="admin">
                <AdminDoctors />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/patients"
            element={
              <ProtectedRoute role="admin">
                <AdminPatients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-profile"
            element={
              <ProtectedRoute role="patient">
                <MyProfile />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}
