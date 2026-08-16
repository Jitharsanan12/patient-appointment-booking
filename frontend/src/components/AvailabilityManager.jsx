/*
  Lets a doctor add/edit/remove weekly availability windows, e.g.
  "Monday, 09:00-17:00", plus zero or more recurring breaks inside each
  window (e.g. a mid-morning break and a separate lunch break). Used
  inside DoctorDashboard.

  Note: these windows only define the doctor's working HOURS. Actual
  bookable slot length comes from the patient's selected visit type (see
  VisitTypeDurations) — there's no per-window slot-duration setting
  anymore, since gap-based scheduling replaced the old fixed-grid system.
*/

import { useEffect, useState } from "react";
import {
  listAvailability,
  createAvailability,
  updateAvailability,
  deleteAvailability,
  createAvailabilityBreak,
  deleteAvailabilityBreak,
} from "../api/client";
import "../pages/AuthPages.css";
import "../pages/DoctorDashboard.css";

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

const DEFAULT_FORM = { dayOfWeek: "0", startTime: "09:00", endTime: "17:00" };
const DEFAULT_BREAK_FORM = { startTime: "", endTime: "" };

export default function AvailabilityManager({ doctorId }) {
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // null = adding a new window; otherwise the id of the window being edited.
  // Breaks are only manageable while editing an EXISTING window (a break
  // needs a real availability_id to attach to), so the break section below
  // only renders while editingId is set.
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [breakForm, setBreakForm] = useState(DEFAULT_BREAK_FORM);

  function load() {
    setLoading(true);
    listAvailability(doctorId)
      .then(setWindows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [doctorId]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startEditing(w) {
    setEditingId(w.id);
    setForm({
      dayOfWeek: String(w.day_of_week),
      startTime: w.start_time.slice(0, 5),
      endTime: w.end_time.slice(0, 5),
    });
    setBreakForm(DEFAULT_BREAK_FORM);
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setBreakForm(DEFAULT_BREAK_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // <input type="time"> gives "HH:MM"; the backend expects "HH:MM:SS".
    // slot_duration_minutes is deliberately omitted — it's a legacy field
    // the backend no longer uses for scheduling (see the note at the top
    // of this file); the API defaults it to 30 on its own when omitted.
    const payload = {
      day_of_week: Number(form.dayOfWeek),
      start_time: `${form.startTime}:00`,
      end_time: `${form.endTime}:00`,
    };
    try {
      if (editingId) {
        await updateAvailability(doctorId, editingId, payload);
        setEditingId(null);
      } else {
        await createAvailability(doctorId, payload);
      }
      setForm(DEFAULT_FORM);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      await deleteAvailability(doctorId, id);
      if (editingId === id) cancelEditing();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function updateBreakField(field, value) {
    setBreakForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAddBreak(e) {
    e.preventDefault();
    setError("");
    try {
      await createAvailabilityBreak(doctorId, editingId, {
        break_start: `${breakForm.startTime}:00`,
        break_end: `${breakForm.endTime}:00`,
      });
      setBreakForm(DEFAULT_BREAK_FORM);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteBreak(breakId) {
    setError("");
    try {
      await deleteAvailabilityBreak(doctorId, editingId, breakId);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // The window currently being edited, read fresh from `windows` (rather
  // than kept as separate state) so its `breaks` list always reflects the
  // latest load() after an add/remove.
  const editingWindow = editingId ? windows.find((w) => w.id === editingId) : null;

  return (
    <div className="dashboard-card">
      <h3 className="dashboard-card-title">Set Availability</h3>

      <form onSubmit={handleSubmit} className="dashboard-form">
        <div className="dashboard-field">
          <label className="dashboard-label" htmlFor="avail-day">
            Day of Week
          </label>
          <select
            id="avail-day"
            className="dashboard-select"
            value={form.dayOfWeek}
            onChange={(e) => updateField("dayOfWeek", e.target.value)}
          >
            {DAY_NAMES.map((name, index) => (
              <option key={index} value={index}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="dashboard-field">
          <label className="dashboard-label" htmlFor="avail-start">
            Start Time
          </label>
          <input
            id="avail-start"
            className="dashboard-input"
            type="time"
            value={form.startTime}
            onChange={(e) => updateField("startTime", e.target.value)}
            required
          />
        </div>
        <div className="dashboard-field">
          <label className="dashboard-label" htmlFor="avail-end">
            End Time
          </label>
          <input
            id="avail-end"
            className="dashboard-input"
            type="time"
            value={form.endTime}
            onChange={(e) => updateField("endTime", e.target.value)}
            required
          />
        </div>
        <button type="submit" className="dashboard-button">
          {editingId ? "Save changes" : "Add window"}
        </button>
        {editingId && (
          <button type="button" className="dashboard-button-secondary" onClick={cancelEditing}>
            Cancel edit
          </button>
        )}
      </form>

      {editingWindow && (
        <div className="avail-breaks-editor">
          <h4 className="dashboard-subheading">
            Breaks for {DAY_NAMES[editingWindow.day_of_week]} {editingWindow.start_time.slice(0, 5)}–
            {editingWindow.end_time.slice(0, 5)}
          </h4>
          <p className="dashboard-card-subtitle">
            Optional recurring breaks inside this window, e.g. a short mid-morning break and a
            separate lunch break — both are subtracted from bookable time every week.
          </p>

          {editingWindow.breaks.length > 0 && (
            <ul className="dashboard-list">
              {editingWindow.breaks.map((b) => (
                <li className="dashboard-list-item" key={b.id}>
                  <span>
                    {b.break_start.slice(0, 5)}–{b.break_end.slice(0, 5)}
                  </span>
                  <div className="dashboard-list-item-actions">
                    <button
                      type="button"
                      className="dashboard-icon-button dashboard-icon-button--danger"
                      onClick={() => handleDeleteBreak(b.id)}
                      aria-label="Remove break"
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

          <form onSubmit={handleAddBreak} className="dashboard-form">
            <div className="dashboard-field">
              <label className="dashboard-label" htmlFor="break-start">
                Break Start
              </label>
              <input
                id="break-start"
                className="dashboard-input"
                type="time"
                value={breakForm.startTime}
                onChange={(e) => updateBreakField("startTime", e.target.value)}
                required
              />
            </div>
            <div className="dashboard-field">
              <label className="dashboard-label" htmlFor="break-end">
                Break End
              </label>
              <input
                id="break-end"
                className="dashboard-input"
                type="time"
                value={breakForm.endTime}
                onChange={(e) => updateBreakField("endTime", e.target.value)}
                required
              />
            </div>
            <button type="submit" className="dashboard-button-secondary">
              Add break
            </button>
          </form>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <h4 className="dashboard-subheading">Current Schedule</h4>
      {loading ? (
        <p className="muted">Loading availability...</p>
      ) : windows.length === 0 ? (
        <p className="muted">No availability windows set yet — patients can't book you until you add one.</p>
      ) : (
        <ul className="dashboard-list">
          {windows.map((w) => (
            <li
              key={w.id}
              className={
                "dashboard-list-item" + (editingId === w.id ? " dashboard-list-item--editing" : "")
              }
            >
              <span>
                {DAY_NAMES[w.day_of_week]} {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}
                {w.breaks.length > 0 && (
                  <span className="muted">
                    {" "}
                    — breaks:{" "}
                    {w.breaks
                      .map((b) => `${b.break_start.slice(0, 5)}–${b.break_end.slice(0, 5)}`)
                      .join(", ")}
                  </span>
                )}
              </span>
              <div className="dashboard-list-item-actions">
                <button
                  type="button"
                  className="dashboard-icon-button"
                  onClick={() => startEditing(w)}
                  aria-label="Edit window"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    edit
                  </span>
                </button>
                <button
                  type="button"
                  className="dashboard-icon-button dashboard-icon-button--danger"
                  onClick={() => handleDelete(w.id)}
                  aria-label="Remove window"
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
