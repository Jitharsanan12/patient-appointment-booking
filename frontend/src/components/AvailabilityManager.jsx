/*
  Lets a doctor add/remove weekly availability windows, e.g.
  "Monday, 09:00-17:00, 30-minute slots". Used inside DoctorDashboard.
*/

import { useEffect, useState } from "react";
import { listAvailability, createAvailability, deleteAvailability } from "../api/client";

// Index 0 = Monday ... 6 = Sunday, matching the backend's day_of_week convention.
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function AvailabilityManager({ doctorId }) {
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dayOfWeek, setDayOfWeek] = useState("0");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState(30);

  function load() {
    setLoading(true);
    listAvailability(doctorId)
      .then(setWindows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [doctorId]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      // <input type="time"> gives "HH:MM"; the backend expects "HH:MM:SS".
      await createAvailability(doctorId, {
        day_of_week: Number(dayOfWeek),
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
        slot_duration_minutes: Number(slotDuration),
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      await deleteAvailability(doctorId, id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card availability-manager">
      <h3>Set Availability</h3>
      <form onSubmit={handleAdd} className="availability-form">
        <label>
          Day
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
            {DAY_NAMES.map((name, index) => (
              <option key={index} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start time
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </label>
        <label>
          End time
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </label>
        <label>
          Slot length (minutes)
          <input
            type="number"
            min="5"
            step="5"
            value={slotDuration}
            onChange={(e) => setSlotDuration(e.target.value)}
            required
          />
        </label>
        <button type="submit">Add window</button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Loading availability...</p>
      ) : windows.length === 0 ? (
        <p className="muted">No availability windows set yet — patients can't book you until you add one.</p>
      ) : (
        <ul className="availability-list">
          {windows.map((w) => (
            <li key={w.id}>
              <span>
                {DAY_NAMES[w.day_of_week]} {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}{" "}
                <span className="muted">({w.slot_duration_minutes} min slots)</span>
              </span>
              <button type="button" onClick={() => handleDelete(w.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
