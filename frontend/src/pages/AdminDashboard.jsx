/*
  Admin page: read-only view of every appointment in the system.
*/

import { useEffect, useState } from "react";
import { listAllAppointments } from "../api/client";

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

  if (loading) return <p>Loading appointments...</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <h2>All Appointments</h2>
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
    </div>
  );
}
