/*
  Admin-only: every registered patient, with a click-to-expand appointment
  history per patient.
*/

import { useEffect, useState } from "react";
import { listPatients, getPatientAppointmentHistory } from "../api/client";

export default function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which patient's history is currently expanded, and what was fetched
  // for them.
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    listPatients()
      .then(setPatients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSelectPatient(patient) {
    if (selectedPatient?.id === patient.id) {
      setSelectedPatient(null);
      return;
    }
    setSelectedPatient(patient);
    setHistoryError("");
    setHistoryLoading(true);
    getPatientAppointmentHistory(patient.id)
      .then(setHistory)
      .catch((err) => setHistoryError(err.message))
      .finally(() => setHistoryLoading(false));
  }

  if (loading) return <p>Loading patients...</p>;

  return (
    <div className="card availability-manager">
      <h3>Patients</h3>
      {error && <p className="error">{error}</p>}
      {patients.length === 0 && <p className="muted">No patients registered yet.</p>}
      <ul className="availability-list">
        {patients.map((patient) => (
          <li key={patient.id} className={selectedPatient?.id === patient.id ? "editing" : ""}>
            <span>
              {patient.full_name}{" "}
              <span className="muted">
                — {patient.email} — registered{" "}
                {new Date(patient.created_at).toLocaleDateString()}
              </span>
            </span>
            <div className="button-row">
              <button type="button" onClick={() => handleSelectPatient(patient)}>
                {selectedPatient?.id === patient.id ? "Hide history" : "View history"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {selectedPatient && (
        <div className="patient-profile-panel">
          <h4>{selectedPatient.full_name}'s appointment history</h4>
          {historyLoading && <p className="muted">Loading history...</p>}
          {historyError && <p className="error">{historyError}</p>}
          {!historyLoading && !historyError && history.length === 0 && (
            <p className="muted">No appointments yet.</p>
          )}
          {!historyLoading && history.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Date</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((appt) => (
                  <tr key={appt.id}>
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
          )}
        </div>
      )}
    </div>
  );
}
