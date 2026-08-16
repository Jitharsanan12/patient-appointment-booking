/*
  Lets a doctor block one-off dates (e.g. a holiday or a day off) —
  this overrides their normal weekly availability for that single date,
  regardless of what day of the week it falls on. Used inside DoctorDashboard.
*/

import { useEffect, useState } from "react";
import {
  listUnavailableDates,
  createUnavailableDate,
  deleteUnavailableDate,
} from "../api/client";
import "../pages/AuthPages.css";
import "../pages/DoctorDashboard.css";

export default function UnavailableDatesManager({ doctorId }) {
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  function load() {
    setLoading(true);
    listUnavailableDates(doctorId)
      .then(setDates)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [doctorId]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await createUnavailableDate(doctorId, { date, reason: reason || null });
      setDate("");
      setReason("");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      await deleteUnavailableDate(doctorId, id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dashboard-card">
      <h3 className="dashboard-card-title">Block a Date</h3>
      <p className="dashboard-card-subtitle">
        Mark a specific date as unavailable — e.g. a holiday — even if it falls on a day you
        normally work. Patients won't see any open slots for that date.
      </p>
      <form onSubmit={handleAdd} className="dashboard-form">
        <div className="dashboard-field">
          <label className="dashboard-label" htmlFor="block-date">
            Date
          </label>
          <input
            id="block-date"
            className="dashboard-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
        <div className="dashboard-field">
          <label className="dashboard-label" htmlFor="block-reason">
            Reason (optional)
          </label>
          <input
            id="block-reason"
            className="dashboard-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Public holiday"
          />
        </div>
        <button type="submit" className="dashboard-button">
          Block date
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">Loading blocked dates...</p>
      ) : dates.length === 0 ? (
        <p className="muted">No blocked dates — your normal weekly availability applies every day.</p>
      ) : (
        <ul className="dashboard-list">
          {dates.map((d) => (
            <li key={d.id} className="dashboard-list-item">
              <span>
                {d.date} {d.reason && <span className="muted">— {d.reason}</span>}
              </span>
              <div className="dashboard-list-item-actions">
                <button
                  type="button"
                  className="dashboard-icon-button dashboard-icon-button--danger"
                  onClick={() => handleDelete(d.id)}
                  aria-label="Remove blocked date"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    delete
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
