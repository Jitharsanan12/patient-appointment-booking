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
    <div className="card availability-manager">
      <h3>Block a Date</h3>
      <p className="muted">
        Mark a specific date as unavailable — e.g. a holiday — even if it falls on a day you
        normally work. Patients won't see any open slots for that date.
      </p>
      <form onSubmit={handleAdd} className="availability-form">
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            required
          />
        </label>
        <label>
          Reason (optional)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Public holiday"
          />
        </label>
        <button type="submit">Block date</button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Loading blocked dates...</p>
      ) : dates.length === 0 ? (
        <p className="muted">No blocked dates — your normal weekly availability applies every day.</p>
      ) : (
        <ul className="availability-list">
          {dates.map((d) => (
            <li key={d.id}>
              <span>
                {d.date} {d.reason && <span className="muted">— {d.reason}</span>}
              </span>
              <button type="button" onClick={() => handleDelete(d.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
