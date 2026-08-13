import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// NOTE: for learning purposes, this form lets you register as patient,
// doctor, or admin. In a real production app, only "patient" would be a
// public self-signup option — doctor/admin accounts would be created by
// an administrator instead.
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "patient",
    specialization: "",
    bio: "",
  });
  const [error, setError] = useState("");

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="form-page">
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Full name
          <input
            value={form.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
          />
        </label>
        <label>
          I am a...
          <select value={form.role} onChange={(e) => updateField("role", e.target.value)}>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {form.role === "doctor" && (
          <>
            <label>
              Specialization
              <input
                value={form.specialization}
                onChange={(e) => updateField("specialization", e.target.value)}
                required
              />
            </label>
            <label>
              Bio (optional)
              <input
                value={form.bio}
                onChange={(e) => updateField("bio", e.target.value)}
              />
            </label>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit">Register</button>
      </form>
      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
