import { useState } from "react";
import { changePassword } from "../api/client";
import "./AuthPages.css";
import "./ChangePassword.css";

// Available to any logged-in user (patient, doctor, or admin) — the backend
// endpoint (PUT /auth/me/password) always acts on whoever the JWT belongs
// to, so there's no role check needed here.
export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="change-password-page">
      <h2 className="change-password-heading">Change Password</h2>

      <div className="auth-card auth-card--change-password">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="auth-label" htmlFor="current-password">
              Current Password
            </label>
            <div className="auth-input-wrap">
              <input
                id="current-password"
                className="auth-input"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                lock
              </span>
            </div>
          </div>

          <div>
            <label className="auth-label" htmlFor="new-password">
              New Password
            </label>
            <div className="auth-input-wrap">
              <input
                id="new-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                lock
              </span>
            </div>
          </div>

          <div>
            <label className="auth-label" htmlFor="confirm-password">
              Confirm New Password
            </label>
            <div className="auth-input-wrap">
              <input
                id="confirm-password"
                className="auth-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                lock
              </span>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <button type="submit" className="auth-button" disabled={submitting}>
            {submitting ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
