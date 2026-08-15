import { useEffect, useState } from "react";
import { getMyProfile, updateMyProfile } from "../api/client";

const BLANK_PROFILE = {
  date_of_birth: "",
  phone_number: "",
  allergies: "",
  existing_conditions: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

// The backend returns null for any field never filled in — convert those
// to "" so every input stays a controlled component.
function toFormValues(profile) {
  const values = { ...BLANK_PROFILE };
  for (const key of Object.keys(values)) {
    values[key] = profile[key] ?? "";
  }
  return values;
}

export default function MyProfile() {
  const [form, setForm] = useState(BLANK_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getMyProfile()
      .then((profile) => setForm(toFormValues(profile)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      // An empty field means "not provided" — send null rather than ""
      // so the backend stores/clears it consistently.
      const payload = {};
      for (const [key, value] of Object.entries(form)) {
        payload[key] = value === "" ? null : value;
      }
      const updated = await updateMyProfile(payload);
      setForm(toFormValues(updated));
      setSuccess("Profile saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading profile...</p>;

  return (
    <div className="form-page">
      <h2>My Profile</h2>
      <p className="muted">
        This medical information is visible to doctors you have an appointment with.
      </p>
      <form onSubmit={handleSubmit}>
        <label>
          Date of birth
          <input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => updateField("date_of_birth", e.target.value)}
          />
        </label>
        <label>
          Phone number
          <input
            value={form.phone_number}
            onChange={(e) => updateField("phone_number", e.target.value)}
          />
        </label>
        <label>
          Allergies
          <textarea
            value={form.allergies}
            onChange={(e) => updateField("allergies", e.target.value)}
          />
        </label>
        <label>
          Existing conditions
          <textarea
            value={form.existing_conditions}
            onChange={(e) => updateField("existing_conditions", e.target.value)}
          />
        </label>
        <label>
          Emergency contact name
          <input
            value={form.emergency_contact_name}
            onChange={(e) => updateField("emergency_contact_name", e.target.value)}
          />
        </label>
        <label>
          Emergency contact phone
          <input
            value={form.emergency_contact_phone}
            onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
