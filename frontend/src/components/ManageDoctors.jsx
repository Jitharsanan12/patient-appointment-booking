/*
  Admin-only: create a new doctor account (email/name/specialization/bio,
  optional password) and view the list of existing doctors. This is the
  only way doctor accounts get created — there's no public signup for it.
*/

import { useEffect, useState } from "react";
import { listDoctors, createDoctorAsAdmin } from "../api/client";
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

  const [form, setForm] = useState(EMPTY_FORM);
  // Holds the just-created doctor's login + temporary password, shown once
  // right after creation (the backend never returns it again after this).
  const [createdDoctor, setCreatedDoctor] = useState(null);

  function load() {
    setLoading(true);
    listDoctors()
      .then(setDoctors)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setCreatedDoctor(null);
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
            <input
              id="doctor-password"
              className="dashboard-input"
              type="text"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder="Leave blank to auto-generate"
            />
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
