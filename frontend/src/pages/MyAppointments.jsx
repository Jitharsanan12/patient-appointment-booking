/*
  Patient page: lists their own upcoming appointments with a cancel button.
*/

import { useEffect, useState } from "react";
import { myUpcomingAppointments, cancelAppointment } from "../api/client";

export default function MyAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
            <button onClick={() => handleCancel(appt.id)}>Cancel</button>
          </div>
        ))}
      </div>
    </div>
  );
}
