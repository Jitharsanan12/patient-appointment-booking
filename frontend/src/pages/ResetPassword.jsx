import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/client";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle";
import logo from "../assets/logo.png";
import "./AuthPages.css";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }
    if (!token) {
      setError("This reset link is missing its token. Please request a new one.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      // Covers the backend's "invalid or expired" rejection, among other
      // errors — surfaced verbatim, same pattern as every other form here.
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--login">
        <div className="auth-brand">
          <img className="auth-logo" src={logo} alt="CareSlot Logo" />
          <h1 className="auth-heading">Reset your password</h1>
          <p className="auth-subtitle">Choose a new password for your account.</p>
        </div>

        {success ? (
          <div className="auth-confirmation">
            <span className="material-symbols-outlined" aria-hidden="true">
              check_circle
            </span>
            <p>Your password has been reset successfully.</p>
            <Link className="auth-link" to="/login">
              Continue to login
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label className="auth-label" htmlFor="new-password">
                New password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="new-password"
                  className="auth-input"
                  type={showNewPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <PasswordVisibilityToggle
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((prev) => !prev)}
                />
              </div>
            </div>

            <div>
              <label className="auth-label" htmlFor="confirm-password">
                Confirm new password
              </label>
              <div className="auth-input-wrap">
                <input
                  id="confirm-password"
                  className="auth-input"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <PasswordVisibilityToggle
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                />
              </div>
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-button" type="submit" disabled={submitting}>
              {submitting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <p>
            Remembered your password? <Link className="auth-link" to="/login">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
