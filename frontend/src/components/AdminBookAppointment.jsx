/*
  Admin-only: book an appointment on behalf of an existing patient (e.g. a
  phone booking). Same date -> available-slots -> confirm flow as the
  patient-facing booking form on the doctors list, plus a patient selector.
*/

import { useEffect, useState } from "react";
import {
  listPatients,
  listDoctors,
  getAvailableSlots,
  adminBookAppointment,
  VISIT_TYPES,
} from "../api/client";
import "../pages/DoctorDashboard.css";
import "../pages/BookingForm.css";

function formatSlotTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminBookAppointment({ onBooked }) {
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [visitType, setVisitType] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    Promise.all([listPatients(), listDoctors()])
      .then(([patientList, doctorList]) => {
        setPatients(patientList);
        setDoctors(doctorList);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  function handleDoctorChange(newDoctorId) {
    setDoctorId(newDoctorId);
    setVisitType("");
    setDate("");
    setSlots([]);
    setSelectedSlot(null);
  }

  // Changing the visit type changes how much room a slot needs, so any
  // previously-fetched date/slots no longer mean anything.
  function handleVisitTypeChange(newVisitType) {
    setVisitType(newVisitType);
    setDate("");
    setSlots([]);
    setSelectedSlot(null);
  }

  // Same "fetch this doctor's real open slots for the chosen date + visit
  // type" flow as the patient booking form — what's shown as pickable is
  // always what the backend will actually accept.
  function handleDateChange(newDate) {
    setDate(newDate);
    setSelectedSlot(null);
    setSlots([]);
    if (!newDate || !doctorId || !visitType) return;

    setSlotsLoading(true);
    setFormError("");
    getAvailableSlots(doctorId, newDate, visitType)
      .then(setSlots)
      .catch((err) => setFormError(err.message))
      .finally(() => setSlotsLoading(false));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMessage("");

    if (!patientId || !doctorId) {
      setFormError("Please select a patient and a doctor.");
      return;
    }
    if (!visitType) {
      setFormError("Please select a visit type.");
      return;
    }
    if (!selectedSlot) {
      setFormError("Please select a time slot.");
      return;
    }
    // Mirrors the backend's own check (see AdminBookAppointmentRequest in
    // app/schemas.py) — a blank or single-character reason isn't
    // meaningful enough for a doctor to act on.
    if (reason.trim().length < 3) {
      setFormError("Reason for visit must be at least 3 characters long");
      return;
    }

    setSubmitting(true);
    try {
      await adminBookAppointment({
        patient_id: Number(patientId),
        doctor_id: Number(doctorId),
        appointment_date: selectedSlot.start_time,
        reason,
        visit_type: visitType,
      });
      setSuccessMessage("Appointment booked.");
      setPatientId("");
      setDoctorId("");
      setVisitType("");
      setDate("");
      setReason("");
      setSlots([]);
      setSelectedSlot(null);
      onBooked?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-card">
      <h3 className="dashboard-card-title">Book Appointment</h3>
      <p className="dashboard-card-subtitle">Book an appointment on a patient's behalf.</p>
      {loadError && <p className="error">{loadError}</p>}

      <form onSubmit={handleSubmit}>
        <div className="booking-section">
          <label className="booking-label" htmlFor="admin-book-patient">
            Patient
          </label>
          <select
            id="admin-book-patient"
            className="booking-select"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            required
          >
            <option value="">Select a patient...</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name} ({patient.email})
              </option>
            ))}
          </select>
        </div>

        <div className="booking-section">
          <label className="booking-label" htmlFor="admin-book-doctor">
            Doctor
          </label>
          <select
            id="admin-book-doctor"
            className="booking-select"
            value={doctorId}
            onChange={(e) => handleDoctorChange(e.target.value)}
            required
          >
            <option value="">Select a doctor...</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name} — {doctor.specialization}
              </option>
            ))}
          </select>
        </div>

        <div className="booking-section">
          <label className="booking-label" htmlFor="admin-book-visit-type">
            Visit type
          </label>
          <select
            id="admin-book-visit-type"
            className="booking-select"
            value={visitType}
            onChange={(e) => handleVisitTypeChange(e.target.value)}
            disabled={!doctorId}
            required
          >
            <option value="">Select a visit type...</option>
            {VISIT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="booking-section">
          <label className="booking-label" htmlFor="admin-book-date">
            Date
          </label>
          <input
            id="admin-book-date"
            className="booking-date-input"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            disabled={!visitType}
            required
          />
        </div>

        {date && (
          <div className="booking-section">
            <label className="booking-label">Available times</label>
            {slotsLoading ? (
              <p className="muted">Loading slots...</p>
            ) : slots.length === 0 ? (
              <p className="muted">No open slots on this date. Try another date.</p>
            ) : (
              <div className="booking-slot-grid">
                {slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.start_time}
                    className={
                      "booking-slot-button" +
                      (selectedSlot?.start_time === slot.start_time ? " booking-slot-selected" : "")
                    }
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatSlotTime(slot.start_time)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="booking-section">
          <label className="booking-label" htmlFor="admin-book-reason">
            Reason
          </label>
          <input
            id="admin-book-reason"
            className="booking-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        {formError && <p className="error">{formError}</p>}
        {successMessage && <p className="success">{successMessage}</p>}

        <button
          type="submit"
          className="booking-submit-button"
          disabled={!selectedSlot || submitting}
        >
          {submitting ? "Booking..." : "Book appointment"}
        </button>
      </form>
    </div>
  );
}
