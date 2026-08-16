/*
  Admin page: book an appointment on a patient's behalf, and a read-only,
  cancel-capable view of every appointment in the system. Doctor
  management and the patients list moved to their own pages/routes — see
  AdminDoctors.jsx and AdminPatients.jsx.
*/

import { useEffect, useState } from "react";
import { listAllAppointments, adminCancelAppointment } from "../api/client";
import AdminBookAppointment from "../components/AdminBookAppointment";
import "./DoctorDashboard.css";
import "./MyAppointments.css";
import "./AdminDashboard.css";

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

  function load() {
    setLoading(true);
    listAllAppointments()
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCancel(appt) {
    const confirmed = window.confirm(
      `Cancel ${appt.patient_name}'s appointment with ${appt.doctor_name} on ` +
        `${new Date(appt.appointment_date).toLocaleString()}? This cannot be undone.`
    );
    if (!confirmed) return;

    setError("");
    setCancellingId(appt.id);
    try {
      await adminCancelAppointment(appt.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="dashboard-page">
      <h2 className="dashboard-heading">All Appointments</h2>

      <div className="admin-section">
        <AdminBookAppointment onBooked={load} />
      </div>

      {loading && <p>Loading appointments...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <div className="admin-table-card">
          {appointments.length === 0 ? (
            <p className="admin-table-empty">No appointments yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date &amp; Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr key={appt.id}>
                    <td>{appt.patient_name}</td>
                    <td>{appt.doctor_name}</td>
                    <td>{new Date(appt.appointment_date).toLocaleString()}</td>
                    <td>
                      <span className={`appointment-badge appointment-badge--${appt.status}`}>
                        {appt.status}
                      </span>
                    </td>
                    <td>
                      {appt.status === "scheduled" && (
                        <button
                          type="button"
                          className="admin-cancel-link"
                          onClick={() => handleCancel(appt)}
                          disabled={cancellingId === appt.id}
                        >
                          {cancellingId === appt.id ? "Cancelling..." : "Cancel"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
