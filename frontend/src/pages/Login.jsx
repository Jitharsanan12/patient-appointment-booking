import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle";
import logo from "../assets/logo.png";
import "./AuthPages.css";

// Must match the exact wording of the 403 login() raises in
// routers/auth.py when the password is correct but the account is
// deactivated — that specific message (as opposed to the generic
// "Incorrect email or password" a wrong password gets) is what tells us
// it's safe to offer reactivation here, since the backend only ever
// sends this particular text once the password has already checked out.
const DEACTIVATED_MESSAGE = "This account has been deactivated";

export default function Login() {
  const { login, reactivate } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [showReactivatePrompt, setShowReactivatePrompt] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  // Set by DeleteAccount.jsx after a successful self-deactivation
  // (navigate("/login", { state: { message: "..." } })) — shown once,
  // read straight from router state rather than a URL param so it never
  // ends up bookmarked or persists across a refresh.
  const [infoMessage] = useState(location.state?.message || "");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setShowReactivatePrompt(false);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
      if (err.message === DEACTIVATED_MESSAGE) {
        setShowReactivatePrompt(true);
      }
    }
  }

  async function handleReactivate() {
    setError("");
    setReactivating(true);
    try {
      await reactivate(email, password);
      navigate("/");
    } catch (err) {
      // Covers the backend's "this account can only be reactivated by an
      // admin" rejection for a deactivated doctor, among other errors —
      // the backend is the real enforcement layer here, so whatever it
      // says is shown as-is rather than the frontend trying to predict it.
      setError(err.message);
      setShowReactivatePrompt(false);
    } finally {
      setReactivating(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--login">
        <div className="auth-brand">
          <img className="auth-logo" src={logo} alt="CareSlot Logo" />
          <h1 className="auth-heading">Log in to CareSlot</h1>
          <p className="auth-subtitle">Welcome back. Please enter your details.</p>
        </div>

        {infoMessage && <p className="success">{infoMessage}</p>}

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

          <div>
            <div className="auth-field-top">
              <label className="auth-label" htmlFor="password">
                Password
              </label>
              <Link className="auth-forgot-link" to="/forgot-password">
                Forgot password?
              </Link>
            </div>
            <div className="auth-input-wrap">
              <input
                id="password"
                className="auth-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <PasswordVisibilityToggle
                visible={showPassword}
                onToggle={() => setShowPassword((prev) => !prev)}
              />
            </div>
          </div>

          {error && <p className="auth-error">{error}</p>}

          {showReactivatePrompt && (
            <div className="auth-reactivate-prompt">
              <p>This account was deactivated. Would you like to reactivate it?</p>
              <button
                type="button"
                className="auth-button auth-button--secondary"
                onClick={handleReactivate}
                disabled={reactivating}
              >
                {reactivating ? "Reactivating..." : "Reactivate account"}
              </button>
            </div>
          )}

          <button className="auth-button" type="submit">
            Sign In
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account? <Link className="auth-link" to="/register">Register now</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
