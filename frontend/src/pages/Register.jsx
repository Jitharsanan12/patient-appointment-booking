import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PasswordVisibilityToggle from "../components/PasswordVisibilityToggle";
import logo from "../assets/logo.png";
import "./AuthPages.css";

// Public self-signup only ever creates a patient account — there's no role
// picker here. Doctor accounts are created by an admin (see AdminDashboard's
// "Manage Doctors" section); the one admin account is seeded once, offline,
// via backend/seed_admin.py.
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Mirrors the backend's own checks (see PatientRegister in
  // app/schemas.py) so the user gets the same specific message instantly
  // instead of waiting on a round trip — the backend re-checks all of
  // this regardless, since it's the real enforcement layer.
  function validate() {
    const name = form.full_name.trim();
    if (name.length < 2) {
      return "Full name must be at least 2 characters long";
    }
    if (/^\d+$/.test(name.replace(/\s/g, ""))) {
      return "Full name cannot be only numbers";
    }
    if (form.password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--register">
        <div className="auth-brand">
          <img className="auth-logo" src={logo} alt="CareSlot Logo" />
          <h1 className="auth-heading">CareSlot</h1>
          <p className="auth-subtitle">Create your account to get started.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="auth-label" htmlFor="fullName">
              Full Name
            </label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                person
              </span>
              <input
                id="fullName"
                className="auth-input"
                type="text"
                placeholder="John Doe"
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="auth-label" htmlFor="email">
              Email Address
            </label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                mail
              </span>
              <input
                id="email"
                className="auth-input"
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="auth-label" htmlFor="password">
              Password
            </label>
            <div className="auth-input-wrap">
              <span className="material-symbols-outlined auth-icon" aria-hidden="true">
                lock
              </span>
              <input
                id="password"
                className="auth-input auth-input--toggle-right"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                minLength={8}
                required
              />
              <PasswordVisibilityToggle
                visible={showPassword}
                onToggle={() => setShowPassword((prev) => !prev)}
              />
            </div>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-button" type="submit">
            Register
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account? <Link className="auth-link" to="/login">Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
