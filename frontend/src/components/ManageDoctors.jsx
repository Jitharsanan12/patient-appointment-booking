/*
  Admin-only: create a new doctor account (email/name/specialization/bio,
  optional password) and view the list of existing doctors. This is the
  only way doctor accounts get created — there's no public signup for it.
*/

import { useEffect, useState } from "react";
import { listDoctors, createDoctorAsAdmin } from "../api/client";

const EMPTY_FORM = { email: "", full_name: "", specialization: "", bio: "", password: "" };

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
    <div className="card availability-manager">
      <h3>Manage Doctors</h3>
      <form onSubmit={handleSubmit} className="availability-form">
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
          Full name
          <input
            value={form.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            required
          />
        </label>
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
          <input value={form.bio} onChange={(e) => updateField("bio", e.target.value)} />
        </label>
        <label>
          Password (optional)
          <input
            type="text"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            placeholder="Leave blank to auto-generate"
          />
        </label>
        <button type="submit">Create doctor</button>
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

      {loading ? (
        <p>Loading doctors...</p>
      ) : (
        <ul className="availability-list">
          {doctors.map((d) => (
            <li key={d.id}>
              <span>
                {d.full_name} <span className="muted">— {d.specialization}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
