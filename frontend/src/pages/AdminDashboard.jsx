/*
  Admin page: manage doctor accounts, and a read-only view of every
  appointment in the system.
*/

import { useEffect, useState } from "react";
import { listAllAppointments, adminCancelAppointment } from "../api/client";
import ManageDoctors from "../components/ManageDoctors";
import AdminBookAppointment from "../components/AdminBookAppointment";
import PatientsList from "../components/PatientsList";

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
    <div>
      <ManageDoctors />
      <AdminBookAppointment onBooked={load} />
      <PatientsList />

      <h2>All Appointments</h2>
      {loading && <p>Loading appointments...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <>
          {appointments.length === 0 && <p>No appointments yet.</p>}
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Date</th>
                <th>Reason</th>
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
                  <td>{appt.reason}</td>
                  <td>
                    <span className={`status status-${appt.status}`}>{appt.status}</span>
                  </td>
                  <td>
                    {appt.status === "scheduled" && (
                      <button
                        type="button"
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
        </>
      )}
    </div>
  );
}
