/*
  Doctor page: lists appointments assigned to them, with buttons to mark
  each one completed or cancelled.
*/

import { useEffect, useState } from "react";
import { myAssignedAppointments, updateAppointmentStatus, getMyDoctorProfile } from "../api/client";
import AvailabilityManager from "../components/AvailabilityManager";

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [doctorId, setDoctorId] = useState(null);

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

  if (loading) return <p>Loading schedule...</p>;

  return (
    <div>
      {doctorId && <AvailabilityManager doctorId={doctorId} />}

      <h2>My Schedule</h2>
      {error && <p className="error">{error}</p>}
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
          </div>
        ))}
      </div>
    </div>
  );
}
