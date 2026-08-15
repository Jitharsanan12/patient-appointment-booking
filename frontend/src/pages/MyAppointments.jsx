/*
  Patient page: lists their own upcoming appointments with a cancel button.
*/

import { useEffect, useState } from "react";
import { myUpcomingAppointments, cancelAppointment, getAttachmentDownloadUrl } from "../api/client";

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
    <div>
      <h2>My Upcoming Appointments</h2>
      {error && <p className="error">{error}</p>}
      {appointments.length === 0 && <p>You have no upcoming appointments.</p>}
      <div className="card-list">
        {appointments.map((appt) => (
          <div className="card" key={appt.id}>
            <h3>{appt.doctor_name}</h3>
            <p>{new Date(appt.appointment_date).toLocaleString()}</p>
            <p className="muted">{appt.reason}</p>
            <p>
              Status: <span className={`status status-${appt.status}`}>{appt.status}</span>
            </p>
            <div className="button-row">
              {appt.has_attachment && (
                <button
                  type="button"
                  onClick={() => handleDownload(appt.id)}
                  disabled={downloadingId === appt.id}
                >
                  {downloadingId === appt.id ? "Preparing..." : "Download attachment"}
                </button>
              )}
              <button onClick={() => handleCancel(appt.id)}>Cancel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
