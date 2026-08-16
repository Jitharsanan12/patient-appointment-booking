import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import "./Navbar.css";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Account dropdown (name/role, Change Password, Logout) — closes on an
  // outside click or Escape, same as any standard menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleLogout() {
    setMenuOpen(false);
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <img className="navbar-logo" src={logo} alt="" />
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
        {user?.role === "doctor" && (
          <>
            <Link to="/doctor">My Schedule</Link>
            <Link to="/doctor/settings">Settings</Link>
          </>
        )}
        {user?.role === "admin" && (
          <>
            <Link to="/admin">All Appointments</Link>
            <Link to="/admin/doctors">Manage Doctors</Link>
            <Link to="/admin/patients">Patients</Link>
          </>
        )}
        {user && (
          <div className="navbar-account" ref={accountRef}>
            <button
              type="button"
              className="navbar-account-trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <span className="material-symbols-outlined navbar-account-avatar" aria-hidden="true">
                account_circle
              </span>
              <span className="navbar-user">{user.full_name}</span>
              <span className="material-symbols-outlined navbar-account-chevron" aria-hidden="true">
                expand_more
              </span>
            </button>

            {menuOpen && (
              <div className="navbar-dropdown" role="menu">
                <div className="navbar-dropdown-header">
                  {user.full_name} <span className="navbar-dropdown-role">({user.role})</span>
                </div>
                <Link
                  to="/change-password"
                  className="navbar-dropdown-item"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  Change Password
                </Link>
                <button
                  type="button"
                  className="navbar-dropdown-item navbar-dropdown-item--danger"
                  role="menuitem"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
