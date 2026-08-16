/*
  Doctor page: lists appointments assigned to them, with buttons to mark
  each one completed or cancelled. This is the "My Schedule" page — the
  availability/durations/block-date settings live on their own page,
  DoctorSettings.jsx.
*/

import { useEffect, useState } from "react";
import {
  myAssignedAppointments,
  updateAppointmentStatus,
  getAttachmentDownloadUrl,
  getPatientProfile,
} from "../api/client";
import "./AuthPages.css";
import "./DoctorDashboard.css";

// Medical profile fields to show, in display order — paired with the raw
// field name so a missing value can fall back to "Not provided".
const PROFILE_FIELDS = [
  ["Date of birth", "date_of_birth"],
  ["Phone number", "phone_number"],
  ["Allergies", "allergies"],
  ["Existing conditions", "existing_conditions"],
  ["Emergency contact name", "emergency_contact_name"],
  ["Emergency contact phone", "emergency_contact_phone"],
];

// Pure display helpers for the "My Schedule" date navigator — these only
// format/filter the appointments already fetched via myAssignedAppointments();
// they never touch the API or scheduling logic.
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayHeader(date) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let dayLabel;
  if (date.getTime() === today.getTime()) dayLabel = "Today";
  else if (date.getTime() === tomorrow.getTime()) dayLabel = "Tomorrow";
  else if (date.getTime() === yesterday.getTime()) dayLabel = "Yesterday";
  else dayLabel = date.toLocaleDateString([], { weekday: "long" });

  const dateLabel = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dayLabel}, ${dateLabel}`;
}

// Splits a Date into a large "09:00" value plus a small "AM"/"PM" label,
// so the time can be styled as the card's most prominent element.
function formatTimeParts(date) {
  const [time, meridiem] = date
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })
    .split(" ");
  return { time, meridiem };
}

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  // Which appointment's patient-info section is currently open, and the
  // profiles fetched so far — keyed by patient id, since the same patient
  // may appear on more than one appointment card.
  const [expandedApptId, setExpandedApptId] = useState(null);
  const [profilesByPatientId, setProfilesByPatientId] = useState({});
  const [profileLoadingApptId, setProfileLoadingApptId] = useState(null);
  const [profileError, setProfileError] = useState("");

  // Which day the schedule list is currently showing — defaults to today.
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  function goToPreviousDay() {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  }

  function goToNextDay() {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  }

  function load() {
    setLoading(true);
    myAssignedAppointments()
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleStatusChange(id, status) {
    setError("");
    try {
      await updateAppointmentStatus(id, status);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(id) {
    setError("");
    setDownloadingId(id);
    try {
      const { url } = await getAttachmentDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleTogglePatientInfo(appt) {
    if (expandedApptId === appt.id) {
      setExpandedApptId(null);
      return;
    }
    setExpandedApptId(appt.id);

    if (profilesByPatientId[appt.patient_id]) return; // already fetched

    setProfileError("");
    setProfileLoadingApptId(appt.id);
    try {
      const profile = await getPatientProfile(appt.patient_id);
      setProfilesByPatientId((prev) => ({ ...prev, [appt.patient_id]: profile }));
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoadingApptId(null);
    }
  }

  if (loading) return <p>Loading schedule...</p>;

  // Same appointments array as before — just filtered to the selected day
  // and sorted by time for display. No refetch, no new API calls.
  const dayAppointments = appointments
    .filter((appt) => startOfDay(new Date(appt.appointment_date)).getTime() === selectedDate.getTime())
    .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));

  // Only highlight the very next upcoming appointment, and only when
  // viewing today — never on past/future days.
  const isViewingToday = selectedDate.getTime() === startOfDay(new Date()).getTime();
  const now = new Date();
  const nextAppointment = isViewingToday
    ? dayAppointments.find((appt) => appt.status === "scheduled" && new Date(appt.appointment_date) >= now)
    : null;

  return (
    <div className="dashboard-page schedule-page">
      <div className="schedule-page-header">
        <h2 className="dashboard-heading">My Schedule</h2>

        <div className="dashboard-date-nav">
          <button
            type="button"
            className="dashboard-date-nav-btn"
            onClick={goToPreviousDay}
            aria-label="Previous day"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_left
            </span>
          </button>
          <h4 className="dashboard-date-label">{formatDayHeader(selectedDate)}</h4>
          <button
            type="button"
            className="dashboard-date-nav-btn"
            onClick={goToNextDay}
            aria-label="Next day"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {profileError && <p className="error">{profileError}</p>}
      </div>

      {dayAppointments.length === 0 ? (
        <div className="dashboard-empty">
          <span className="material-symbols-outlined" aria-hidden="true">
            calendar_month
          </span>
          <p>No appointments scheduled for this day.</p>
        </div>
      ) : (
        <div className="dashboard-appointments schedule-page-appointments">
          {dayAppointments.map((appt) => {
            const { time, meridiem } = formatTimeParts(new Date(appt.appointment_date));
            return (
              <div
                className={
                  "dashboard-appointment-card" +
                  (nextAppointment && nextAppointment.id === appt.id
                    ? " dashboard-appointment-card--next"
                    : "")
                }
                key={appt.id}
              >
                <div className="appt-time-block">
                  <span className="appt-time-value">{time}</span>
                  <span className="appt-time-meridiem">{meridiem}</span>
                </div>

                <div className="appt-card-body">
                  <div className="appt-card-top">
                    <p className="appt-patient-name">{appt.patient_name}</p>
                    <span className="visit-type-badge">
                      {appt.visit_type} · {appt.duration_minutes} min
                    </span>
                  </div>
                  <p className="appt-reason">
                    <span className="appt-reason-label">Reason:</span>
                    {appt.reason}
                  </p>

                  <div className="dashboard-appointment-actions">
                    {appt.has_attachment && (
                      <button
                        type="button"
                        className="dashboard-button-secondary"
                        onClick={() => handleDownload(appt.id)}
                        disabled={downloadingId === appt.id}
                      >
                        {downloadingId === appt.id ? "Preparing..." : "Download attachment"}
                      </button>
                    )}
                    {appt.status === "scheduled" && (
                      <>
                        <button
                          type="button"
                          className="dashboard-button"
                          onClick={() => handleStatusChange(appt.id, "completed")}
                        >
                          Mark completed
                        </button>
                        <button
                          type="button"
                          className="dashboard-button-secondary"
                          onClick={() => handleStatusChange(appt.id, "cancelled")}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="dashboard-button-secondary"
                      onClick={() => handleTogglePatientInfo(appt)}
                    >
                      {expandedApptId === appt.id ? "Hide patient info" : "View patient info"}
                    </button>
                  </div>

                  {expandedApptId === appt.id && (
                    <div className="dashboard-patient-profile">
                      {profileLoadingApptId === appt.id ? (
                        <p className="muted">Loading patient info...</p>
                      ) : (
                        profilesByPatientId[appt.patient_id] && (
                          <dl>
                            {PROFILE_FIELDS.map(([label, field]) => (
                              <div key={field}>
                                <dt>{label}</dt>
                                <dd>{profilesByPatientId[appt.patient_id][field] || "Not provided"}</dd>
                              </div>
                            ))}
                          </dl>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
