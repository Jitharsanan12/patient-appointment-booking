/*
  Admin-only: every registered patient, with a click-to-expand appointment
  history per patient.
*/

import { useEffect, useState } from "react";
import { listPatients, getPatientAppointmentHistory, deactivatePatientAsAdmin } from "../api/client";
import "../pages/DoctorDashboard.css";
import "../pages/MyAppointments.css";
import "../pages/AdminDashboard.css";

export default function PatientsList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deactivatingId, setDeactivatingId] = useState(null);

  // Which patient's history is currently expanded, and what was fetched
  // for them.
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  function load() {
    setLoading(true);
    listPatients()
      .then(setPatients)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDeactivate(patient) {
    const confirmed = window.confirm(
      `Deactivate ${patient.full_name}'s account? They will no longer be able to log in. ` +
        `Their appointments and history are kept exactly as they are.`
    );
    if (!confirmed) return;

    setError("");
    setDeactivatingId(patient.id);
    try {
      await deactivatePatientAsAdmin(patient.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeactivatingId(null);
    }
  }

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
    <>
      <div className="dashboard-card admin-section">
        <h3 className="dashboard-card-title">Patients</h3>
        {error && <p className="error">{error}</p>}

        {patients.length === 0 ? (
          <p className="muted">No patients registered yet.</p>
        ) : (
          <div className="admin-table-card">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.full_name}</td>
                    <td>{patient.email}</td>
                    <td>{new Date(patient.created_at).toLocaleDateString()}</td>
                    <td>
                      <span
                        className={`admin-status-badge admin-status-badge--${
                          patient.is_active ? "active" : "inactive"
                        }`}
                      >
                        {patient.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="dashboard-button-secondary"
                          onClick={() => handleSelectPatient(patient)}
                        >
                          {selectedPatient?.id === patient.id ? "Hide history" : "View history"}
                        </button>
                        {patient.is_active && (
                          <button
                            type="button"
                            className="admin-cancel-link"
                            onClick={() => handleDeactivate(patient)}
                            disabled={deactivatingId === patient.id}
                          >
                            {deactivatingId === patient.id ? "Deactivating..." : "Deactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPatient && (
        <div className="dashboard-card">
          <h3 className="dashboard-card-title">{selectedPatient.full_name}'s appointment history</h3>
          {historyLoading && <p className="muted">Loading history...</p>}
          {historyError && <p className="error">{historyError}</p>}
          {!historyLoading && !historyError && history.length === 0 && (
            <p className="muted">No appointments yet.</p>
          )}
          {!historyLoading && history.length > 0 && (
            <div className="admin-table-card">
              <table className="admin-table">
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
                        <span className={`appointment-badge appointment-badge--${appt.status}`}>
                          {appt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
