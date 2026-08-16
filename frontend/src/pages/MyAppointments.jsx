/*
  Patient page: lists their own upcoming appointments with a cancel button.
*/

import { useEffect, useState } from "react";
import { myUpcomingAppointments, cancelAppointment, getAttachmentDownloadUrl } from "../api/client";
import "./AuthPages.css";
import "./MyAppointments.css";

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which appointment's download link is currently being fetched, if any —
  // lets just that one card show a "preparing..." state instead of every
  // download button on the page.
  const [downloadingId, setDownloadingId] = useState(null);

  function load() {
    setLoading(true);
    myUpcomingAppointments()
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCancel(id) {
    setError("");
    try {
      await cancelAppointment(id);
      load(); // refresh the list after cancelling
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(id) {
    setError("");
    setDownloadingId(id);
    try {
      // Fetched fresh every click rather than cached — the presigned URL
      // expires a few minutes after being issued.
      const { url } = await getAttachmentDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) return <p>Loading appointments...</p>;

  return (
    <div className="appointments-page">
      <h1 className="appointments-heading">My Appointments</h1>
      {error && <p className="error">{error}</p>}

      {appointments.length === 0 ? (
        <div className="appointments-empty">
          <span className="material-symbols-outlined" aria-hidden="true">
            calendar_month
          </span>
          <p>You don't have any appointments yet.</p>
        </div>
      ) : (
        <div className="appointments-grid">
          {appointments.map((appt) => (
            <div className="appointment-card" key={appt.id}>
              <div className="appointment-card-header">
                <div className="appointment-doctor">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    calendar_month
                  </span>
                  <p className="appointment-doctor-name">{appt.doctor_name}</p>
                </div>
                <span className={`appointment-badge appointment-badge--${appt.status}`}>
                  {appt.status}
                </span>
              </div>

              <div className="appointment-field">
                <span className="appointment-field-label">Date &amp; Time</span>
                <p className="appointment-field-value">
                  {new Date(appt.appointment_date).toLocaleString()}
                </p>
              </div>

              <div className="appointment-field">
                <span className="appointment-field-label">Reason</span>
                <p className="appointment-field-value">{appt.reason}</p>
              </div>

              {appt.has_attachment && (
                <button
                  type="button"
                  className="appointment-attachment-link"
                  onClick={() => handleDownload(appt.id)}
                  disabled={downloadingId === appt.id}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    attach_file
                  </span>
                  {downloadingId === appt.id ? "Preparing..." : "View attachment"}
                </button>
              )}

              {appt.status === "scheduled" && (
                <button
                  type="button"
                  className="appointment-cancel-button"
                  onClick={() => handleCancel(appt.id)}
                >
                  Cancel Appointment
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
