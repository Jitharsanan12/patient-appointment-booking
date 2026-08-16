import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import "./AuthPages.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--login">
        <div className="auth-brand">
          <img className="auth-logo" src={logo} alt="Appointment Booking Logo" />
          <h1 className="auth-heading">Log in to Appointment Booking</h1>
          <p className="auth-subtitle">Welcome back. Please enter your details.</p>
        </div>

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
              {/* Decorative only, matching the mockup — this app has no
                  password-reset feature, so it's inert (no navigation). */}
              <a className="auth-forgot-link" href="#" onClick={(e) => e.preventDefault()}>
                Forgot password?
              </a>
            </div>
            <div className="auth-input-wrap">
              <input
                id="password"
                className="auth-input"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                lock
              </span>
            </div>
          </div>

          {error && <p className="auth-error">{error}</p>}

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
