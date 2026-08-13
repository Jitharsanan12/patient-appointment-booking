/*
  Admin page: manage doctor accounts, and a read-only view of every
  appointment in the system.
*/

import { useEffect, useState } from "react";
import { listAllAppointments } from "../api/client";
import ManageDoctors from "../components/ManageDoctors";

export default function AdminDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listAllAppointments()
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <ManageDoctors />

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
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
