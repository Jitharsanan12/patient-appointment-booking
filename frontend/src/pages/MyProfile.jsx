import { useEffect, useState } from "react";
import { getMyProfile, updateMyProfile } from "../api/client";
import "./MyProfile.css";

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
    <div className="profile-page">
      <h2 className="profile-heading">My Profile</h2>
      <p className="profile-subtitle">
        This medical information is visible to doctors you have an appointment with.
      </p>

      <div className="profile-card">
        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-field">
            <label className="profile-label" htmlFor="date-of-birth">
              Date of Birth
            </label>
            <div className="profile-input-wrap">
              <input
                id="date-of-birth"
                className="profile-input"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => updateField("date_of_birth", e.target.value)}
              />
              <span className="material-symbols-outlined profile-icon" aria-hidden="true">
                calendar_month
              </span>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="phone-number">
              Phone Number
            </label>
            <div className="profile-input-wrap">
              <input
                id="phone-number"
                className="profile-input"
                value={form.phone_number}
                onChange={(e) => updateField("phone_number", e.target.value)}
              />
              <span className="material-symbols-outlined profile-icon" aria-hidden="true">
                call
              </span>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="allergies">
              Allergies
            </label>
            <div className="profile-input-wrap">
              <textarea
                id="allergies"
                className="profile-textarea"
                value={form.allergies}
                onChange={(e) => updateField("allergies", e.target.value)}
              />
              <span
                className="material-symbols-outlined profile-icon profile-icon--top"
                aria-hidden="true"
              >
                warning
              </span>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="existing-conditions">
              Existing Conditions
            </label>
            <div className="profile-input-wrap">
              <textarea
                id="existing-conditions"
                className="profile-textarea"
                value={form.existing_conditions}
                onChange={(e) => updateField("existing_conditions", e.target.value)}
              />
              <span
                className="material-symbols-outlined profile-icon profile-icon--top"
                aria-hidden="true"
              >
                medical_information
              </span>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="emergency-contact-name">
              Emergency Contact Name
            </label>
            <div className="profile-input-wrap">
              <input
                id="emergency-contact-name"
                className="profile-input"
                value={form.emergency_contact_name}
                onChange={(e) => updateField("emergency_contact_name", e.target.value)}
              />
              <span className="material-symbols-outlined profile-icon" aria-hidden="true">
                person
              </span>
            </div>
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="emergency-contact-phone">
              Emergency Contact Phone
            </label>
            <div className="profile-input-wrap">
              <input
                id="emergency-contact-phone"
                className="profile-input"
                value={form.emergency_contact_phone}
                onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
              />
              <span className="material-symbols-outlined profile-icon" aria-hidden="true">
                call
              </span>
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <button type="submit" className="profile-button" disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
