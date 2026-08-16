import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/client";
import logo from "../assets/logo.png";
import "./AuthPages.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword(email);
      // Same generic outcome shown regardless of whether the email was
      // actually registered — the backend's response never says either
      // way (see POST /auth/forgot-password), so there's nothing more
      // specific to show here even on success.
      setSubmitted(true);
    } catch (err) {
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
          <h1 className="auth-heading">Forgot your password?</h1>
          <p className="auth-subtitle">
            Enter your email and we'll send you a link to reset it.
          </p>
        </div>

        {submitted ? (
          <div className="auth-confirmation">
            <span className="material-symbols-outlined" aria-hidden="true">
              mark_email_read
            </span>
            <p>If an account exists with that email, we've sent a reset link. Check your inbox.</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label className="auth-label" htmlFor="email">
                Email address
              </label>
              <div className="auth-input-wrap">
                <input
                  id="email"
                  className="auth-input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                  mail
                </span>
              </div>
            </div>

            {error && <p className="auth-error">{error}</p>}

            <button className="auth-button" type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send reset link"}
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
