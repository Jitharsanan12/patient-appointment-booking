/*
  Lets a doctor block a one-off date (e.g. a holiday or a day off) — this
  overrides their normal weekly availability for that single date,
  regardless of what day of the week it falls on. Used inside
  DoctorDashboard.

  A block can cover the WHOLE date (the original, still-default
  behavior) or just a specific hour range on that date (e.g. blocking
  12:00-13:00 for a personal appointment while staying bookable the rest
  of the day) — see the "Block Type" toggle below.
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
  // "day" = block the whole date (default, original behavior). "hours" =
  // block only the range given by blockedStart/blockedEnd below.
  const [blockMode, setBlockMode] = useState("day");
  const [blockedStart, setBlockedStart] = useState("");
  const [blockedEnd, setBlockedEnd] = useState("");

  function load() {
    setLoading(true);
    listUnavailableDates(doctorId)
      .then(setDates)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [doctorId]);

  function resetForm() {
    setDate("");
    setReason("");
    setBlockMode("day");
    setBlockedStart("");
    setBlockedEnd("");
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await createUnavailableDate(doctorId, {
        date,
        reason: reason || null,
        blocked_start: blockMode === "hours" ? `${blockedStart}:00` : null,
        blocked_end: blockMode === "hours" ? `${blockedEnd}:00` : null,
      });
      resetForm();
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
        normally work. Patients won't see any open slots for that date, or just that time range if
        you block specific hours instead.
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
          <span className="dashboard-label">Block Type</span>
          <div className="segmented-control" role="tablist" aria-label="Block type">
            <button
              type="button"
              role="tab"
              aria-selected={blockMode === "day"}
              className={
                "segmented-control-option" +
                (blockMode === "day" ? " segmented-control-option--active" : "")
              }
              onClick={() => setBlockMode("day")}
            >
              Entire Day
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={blockMode === "hours"}
              className={
                "segmented-control-option" +
                (blockMode === "hours" ? " segmented-control-option--active" : "")
              }
              onClick={() => setBlockMode("hours")}
            >
              Specific Hours
            </button>
          </div>
        </div>

        <div
          className={
            "block-hours-fields" + (blockMode === "hours" ? " block-hours-fields--visible" : "")
          }
        >
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="block-start">
              Start Time
            </label>
            <input
              id="block-start"
              className="dashboard-input"
              type="time"
              value={blockedStart}
              onChange={(e) => setBlockedStart(e.target.value)}
              required={blockMode === "hours"}
            />
          </div>
          <div className="dashboard-field">
            <label className="dashboard-label" htmlFor="block-end">
              End Time
            </label>
            <input
              id="block-end"
              className="dashboard-input"
              type="time"
              value={blockedEnd}
              onChange={(e) => setBlockedEnd(e.target.value)}
              required={blockMode === "hours"}
            />
          </div>
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
                {d.date}
                {d.blocked_start && (
                  <span className="muted">
                    {" "}
                    · {d.blocked_start.slice(0, 5)}–{d.blocked_end.slice(0, 5)}
                  </span>
                )}
                {d.reason && <span className="muted"> — {d.reason}</span>}
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
