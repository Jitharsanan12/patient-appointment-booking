/*
  Admin-only: create a new doctor account (email/name/specialization/bio,
  optional password) and view the list of existing doctors. This is the
  only way doctor accounts get created — there's no public signup for it.
*/

import { useEffect, useState } from "react";
import {
  listAllDoctorsAsAdmin,
  createDoctorAsAdmin,
  deactivateDoctorAsAdmin,
  reactivateDoctorAsAdmin,
} from "../api/client";
import PasswordVisibilityToggle from "./PasswordVisibilityToggle";
import "../pages/DoctorDashboard.css";
import "../pages/DoctorList.css";
import "../pages/AdminDashboard.css";

const EMPTY_FORM = { email: "", full_name: "", specialization: "", bio: "", password: "" };

// Same presentation-only avatar helpers as DoctorList.jsx (derived from
// data we already have — name/id — since there are no doctor photos).
// Duplicated rather than imported: this codebase keeps small per-page
// presentation helpers local (see e.g. formatSlotTime in both
// DoctorList.jsx and AdminBookAppointment.jsx) rather than sharing a
// utils module across unrelated pages.
function getInitials(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#dcfce7", text: "#166534" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#fef3c7", text: "#92400e" },
  { bg: "#e0e7ff", text: "#3730a3" },
  { bg: "#ccfbf1", text: "#115e59" },
];

function getAvatarColors(doctorId) {
  return AVATAR_PALETTE[doctorId % AVATAR_PALETTE.length];
}

export default function ManageDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  // Holds the just-created doctor's login + temporary password, shown once
  // right after creation (the backend never returns it again after this).
  const [createdDoctor, setCreatedDoctor] = useState(null);

  function load() {
    setLoading(true);
    // The admin-only listing (unlike listDoctors(), which the public
    // booking flow uses) returns every doctor regardless of status, so
    // deactivated doctors still show up here to manage.
    listAllDoctorsAsAdmin()
      .then(setDoctors)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDeactivate(doctor) {
    const confirmed = window.confirm(
      `Deactivate Dr. ${doctor.full_name}? They will no longer be able to log in, and will ` +
        `disappear from patients' booking list. Their existing appointments and history are kept exactly as they are.`
    );
    if (!confirmed) return;

    setError("");
    setDeactivatingId(doctor.id);
    try {
      await deactivateDoctorAsAdmin(doctor.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeactivatingId(null);
    }
  }

  // Doctors can't do this themselves (see POST /auth/reactivate in
  // routers/auth.py, which explicitly rejects any non-patient role) —
  // this admin action is the only way a deactivated doctor comes back.
  async function handleReactivate(doctor) {
    const confirmed = window.confirm(
      `Reactivate Dr. ${doctor.full_name}? They will be able to log in again and reappear in ` +
        `patients' booking list.`
    );
    if (!confirmed) return;

    setError("");
    setReactivatingId(doctor.id);
    try {
      await reactivateDoctorAsAdmin(doctor.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setReactivatingId(null);
    }
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Mirrors the backend's own checks (see AdminCreateDoctorRequest in
  // app/schemas.py). Password is optional here (blank means "auto-
  // generate one"), so it's only length-checked when the admin actually
  // types one.
  function validate() {
    const name = form.full_name.trim();
    if (name.length < 2) {
      return "Full name must be at least 2 characters long";
    }
    if (/^\d+$/.test(name.replace(/\s/g, ""))) {
      return "Full name cannot be only numbers";
    }
    if (form.password && form.password.length < 8) {
      return "Password must be at least 8 characters long";
    }
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setCreatedDoctor(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const payload = {
        email: form.email,
        full_name: form.full_name,
        specialization: form.specialization,
        bio: form.bio || null,
        // Leave password unset so the backend generates a temporary one.
        password: form.password || null,
      };
      const created = await createDoctorAsAdmin(payload);
      setCreatedDoctor(created);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="dashboard-card admin-section">
        <h3 className="dashboard-card-title">Create Doctor</h3>
        <form onSubmit={handleSubmit} className="dashboard-form">
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="doctor-email">
              Email
            </label>
            <input
              id="doctor-email"
              className="dashboard-input"
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
            />
          </div>
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="doctor-name">
              Full name
            </label>
            <input
              id="doctor-name"
              className="dashboard-input"
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              required
            />
          </div>
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="doctor-specialization">
              Specialization
            </label>
            <input
              id="doctor-specialization"
              className="dashboard-input"
              value={form.specialization}
              onChange={(e) => updateField("specialization", e.target.value)}
              required
            />
          </div>
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="doctor-bio">
              Bio (optional)
            </label>
            <input
              id="doctor-bio"
              className="dashboard-input"
              value={form.bio}
              onChange={(e) => updateField("bio", e.target.value)}
            />
          </div>
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="doctor-password">
              Password (optional)
            </label>
            <div className="dashboard-input-wrap">
              <input
                id="doctor-password"
                className="dashboard-input dashboard-input--toggle-right"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Leave blank to auto-generate"
                minLength={8}
              />
              <PasswordVisibilityToggle
                visible={showPassword}
                onToggle={() => setShowPassword((prev) => !prev)}
              />
            </div>
          </div>
          <button type="submit" className="dashboard-button">
            Create doctor
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        {createdDoctor && (
          <p className={createdDoctor.email_sent ? "success" : "error"}>
            Created {createdDoctor.full_name} ({createdDoctor.email}).{" "}
            {createdDoctor.email_sent
              ? "Their login details were emailed to them."
              : "Could not send the welcome email — share these with them yourself:"}{" "}
            Temporary password: <strong>{createdDoctor.temporary_password}</strong> — it won't be
            shown again.
          </p>
        )}
      </div>

      <div className="dashboard-card">
        <h3 className="dashboard-card-title">Existing Doctors</h3>
        {loading ? (
          <p className="muted">Loading doctors...</p>
        ) : doctors.length === 0 ? (
          <p className="muted">No doctors yet.</p>
        ) : (
          <ul className="dashboard-list">
            {doctors.map((d) => {
              const avatarColors = getAvatarColors(d.id);
              return (
                <li className="dashboard-list-item" key={d.id}>
                  <div className="admin-doctor-row">
                    <div
                      className="doctor-avatar doctor-avatar--sm"
                      style={{ background: avatarColors.bg, color: avatarColors.text }}
                    >
                      {getInitials(d.full_name)}
                    </div>
                    <div>
                      <p className="admin-doctor-name">{d.full_name}</p>
                      <p className="admin-doctor-specialty">{d.specialization}</p>
                    </div>
                  </div>
                  <div className="admin-table-actions">
                    <span
                      className={`admin-status-badge admin-status-badge--${
                        d.is_active ? "active" : "inactive"
                      }`}
                    >
                      {d.is_active ? "Active" : "Inactive"}
                    </span>
                    {d.is_active ? (
                      <button
                        type="button"
                        className="admin-cancel-link"
                        onClick={() => handleDeactivate(d)}
                        disabled={deactivatingId === d.id}
                      >
                        {deactivatingId === d.id ? "Deactivating..." : "Deactivate"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-reactivate-link"
                        onClick={() => handleReactivate(d)}
                        disabled={reactivatingId === d.id}
                      >
                        {reactivatingId === d.id ? "Reactivating..." : "Reactivate"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
