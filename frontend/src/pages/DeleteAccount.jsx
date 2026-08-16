import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deactivateMyAccount } from "../api/client";
import { useAuth } from "../context/AuthContext";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle";
import "./AuthPages.css";
import "./ChangePassword.css";
import "./DeleteAccount.css";

// Patient-only (see the navbar link in Navbar.jsx and the ProtectedRoute
// on this page's route in App.jsx) — the backend endpoint (DELETE
// /auth/me) is patient-only too.
export default function DeleteAccount() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const confirmed = window.confirm(
      "This will deactivate your account and log you out. You won't be able to log back in " +
        "unless an admin reactivates you. Are you sure you want to continue?"
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      await deactivateMyAccount(currentPassword);
      // The account is now deactivated server-side, and its token no
      // longer validates (see get_current_user's is_active check) — clear
      // it client-side too and send the user to Login with a confirmation.
      logout();
      navigate("/login", {
        state: { message: "Your account has been deactivated. We're sorry to see you go." },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="change-password-page">
      <h2 className="change-password-heading">Delete Account</h2>

      <div className="auth-card auth-card--change-password">
        <div className="delete-account-warning">
          <span className="material-symbols-outlined" aria-hidden="true">
            warning
          </span>
          <p>
            Deactivating your account will immediately log you out and prevent you from logging
            back in. Your existing appointments and history are <strong>not</strong> deleted — they
            stay exactly as they are. This action cannot be undone by you; contact an admin if you
            change your mind.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="auth-label" htmlFor="current-password">
              Current Password
            </label>
            <div className="auth-input-wrap">
              <input
                id="current-password"
                className="auth-input"
                type={showCurrentPassword ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <PasswordVisibilityToggle
                visible={showCurrentPassword}
                onToggle={() => setShowCurrentPassword((prev) => !prev)}
              />
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="auth-button auth-button--danger" disabled={submitting}>
            {submitting ? "Deactivating..." : "Deactivate my account"}
          </button>
        </form>
      </div>
    </div>
  );
}
