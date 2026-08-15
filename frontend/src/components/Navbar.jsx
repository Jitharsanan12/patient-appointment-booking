import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        Appointment Booking
      </Link>
      <div className="navbar-links">
        {!user && (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
        {user?.role === "patient" && (
          <>
            <Link to="/">Doctors</Link>
            <Link to="/my-appointments">My Appointments</Link>
            <Link to="/my-profile">My Profile</Link>
          </>
        )}
        {user?.role === "doctor" && <Link to="/doctor">My Schedule</Link>}
        {user?.role === "admin" && <Link to="/admin">All Appointments</Link>}
        {user && (
          <>
            <span className="navbar-user">
              {user.full_name} ({user.role})
            </span>
            <Link to="/change-password">Change Password</Link>
            <button onClick={handleLogout}>Logout</button>
          </>
        )}
      </div>
    </nav>
  );
}
