/*
  Lets a doctor set/edit how long (in minutes) each fixed visit type takes
  THEM specifically — e.g. their own "Consultation" might be 30 minutes
  while another doctor's is 45. Used inside DoctorDashboard, alongside
  availability management.
*/

import { useEffect, useState } from "react";
import { VISIT_TYPES, listVisitTypeDurations, updateVisitTypeDurations } from "../api/client";

export default function VisitTypeDurations({ doctorId }) {
  // { "Follow-up": 15, "Consultation": 30, "New Patient": 45 }
  const [durations, setDurations] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function toMap(rows) {
    const map = {};
    rows.forEach((row) => {
      map[row.visit_type] = row.duration_minutes;
    });
    return map;
  }

  function load() {
    setLoading(true);
    listVisitTypeDurations(doctorId)
      .then((rows) => setDurations(toMap(rows)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [doctorId]);

  function updateField(visitType, value) {
    setDurations((prev) => ({ ...prev, [visitType]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const payload = VISIT_TYPES.map((visitType) => ({
        visit_type: visitType,
        duration_minutes: Number(durations[visitType]),
      }));
      const updated = await updateVisitTypeDurations(doctorId, payload);
      setDurations(toMap(updated));
      setSuccess("Visit type durations saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading visit type durations...</p>;

  return (
    <div className="card availability-manager">
      <h3>Visit Type Durations</h3>
      <p className="muted">
        How long each visit type takes you specifically — patients pick a type by name, and only
        see time slots with enough room for it.
      </p>
      <form onSubmit={handleSubmit} className="availability-form">
        {VISIT_TYPES.map((visitType) => (
          <label key={visitType}>
            {visitType} (minutes)
            <input
              type="number"
              min="5"
              step="5"
              value={durations[visitType] ?? ""}
              onChange={(e) => updateField(visitType, e.target.value)}
              required
            />
          </label>
        ))}
        <div className="button-row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save durations"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
    </div>
  );
}
