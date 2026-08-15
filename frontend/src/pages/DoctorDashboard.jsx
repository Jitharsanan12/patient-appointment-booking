/*
  Doctor page: lists appointments assigned to them, with buttons to mark
  each one completed or cancelled.
*/

import { useEffect, useState } from "react";
import {
  myAssignedAppointments,
  updateAppointmentStatus,
  getMyDoctorProfile,
  getAttachmentDownloadUrl,
  getPatientProfile,
} from "../api/client";
import AvailabilityManager from "../components/AvailabilityManager";
import UnavailableDatesManager from "../components/UnavailableDatesManager";

// Medical profile fields to show, in display order — paired with the raw
// field name so a missing value can fall back to "Not provided".
const PROFILE_FIELDS = [
  ["Date of birth", "date_of_birth"],
  ["Phone number", "phone_number"],
  ["Allergies", "allergies"],
  ["Existing conditions", "existing_conditions"],
  ["Emergency contact name", "emergency_contact_name"],
  ["Emergency contact phone", "emergency_contact_phone"],
];

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [doctorId, setDoctorId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Which appointment's patient-info section is currently open, and the
  // profiles fetched so far — keyed by patient id, since the same patient
  // may appear on more than one appointment card.
  const [expandedApptId, setExpandedApptId] = useState(null);
  const [profilesByPatientId, setProfilesByPatientId] = useState({});
  const [profileLoadingApptId, setProfileLoadingApptId] = useState(null);
  const [profileError, setProfileError] = useState("");

  function load() {
    setLoading(true);
    myAssignedAppointments()
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    getMyDoctorProfile().then((profile) => setDoctorId(profile.id));
  }, []);

  async function handleStatusChange(id, status) {
    setError("");
    try {
      await updateAppointmentStatus(id, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(id) {
    setError("");
    setDownloadingId(id);
    try {
      const { url } = await getAttachmentDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleTogglePatientInfo(appt) {
    if (expandedApptId === appt.id) {
      setExpandedApptId(null);
      return;
    }
    setExpandedApptId(appt.id);

    if (profilesByPatientId[appt.patient_id]) return; // already fetched

    setProfileError("");
    setProfileLoadingApptId(appt.id);
    try {
      const profile = await getPatientProfile(appt.patient_id);
      setProfilesByPatientId((prev) => ({ ...prev, [appt.patient_id]: profile }));
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoadingApptId(null);
    }
  }

  if (loading) return <p>Loading schedule...</p>;

  return (
    <div>
      {doctorId && (
        <>
          <AvailabilityManager doctorId={doctorId} />
          <UnavailableDatesManager doctorId={doctorId} />
        </>
      )}

      <h2>My Schedule</h2>
      {error && <p className="error">{error}</p>}
      {profileError && <p className="error">{profileError}</p>}
      {appointments.length === 0 && <p>No appointments assigned to you yet.</p>}
      <div className="card-list">
        {appointments.map((appt) => (
          <div className="card" key={appt.id}>
            <h3>{appt.patient_name}</h3>
            <p>{new Date(appt.appointment_date).toLocaleString()}</p>
            <p className="muted">{appt.reason}</p>
            <p>
              Status: <span className={`status status-${appt.status}`}>{appt.status}</span>
            </p>
            {appt.has_attachment && (
              <button
                type="button"
                onClick={() => handleDownload(appt.id)}
                disabled={downloadingId === appt.id}
              >
                {downloadingId === appt.id ? "Preparing..." : "Download attachment"}
              </button>
            )}
            {appt.status === "scheduled" && (
              <div className="button-row">
                <button onClick={() => handleStatusChange(appt.id, "completed")}>
                  Mark completed
                </button>
                <button onClick={() => handleStatusChange(appt.id, "cancelled")}>
                  Cancel
                </button>
              </div>
            )}

            <button type="button" onClick={() => handleTogglePatientInfo(appt)}>
              {expandedApptId === appt.id ? "Hide patient info" : "View patient info"}
            </button>

            {expandedApptId === appt.id && (
              <div className="patient-profile-panel">
                {profileLoadingApptId === appt.id ? (
                  <p className="muted">Loading patient info...</p>
                ) : (
                  profilesByPatientId[appt.patient_id] && (
                    <dl>
                      {PROFILE_FIELDS.map(([label, field]) => (
                        <div key={field}>
                          <dt>{label}</dt>
                          <dd>{profilesByPatientId[appt.patient_id][field] || "Not provided"}</dd>
                        </div>
                      ))}
                    </dl>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
