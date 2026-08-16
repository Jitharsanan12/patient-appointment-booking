/*
  Home page for patients: shows every doctor, with a "Book" button that
  opens a booking flow: pick a date, then pick one of the doctor's actual
  open time slots for that date (fetched from the backend), then confirm.
*/

import { useEffect, useState } from "react";
import {
  listDoctors,
  bookAppointment,
  getAvailableSlots,
  uploadAttachment,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  VISIT_TYPES,
} from "../api/client";
import "./AuthPages.css";
import "./DoctorList.css";
import "./BookingForm.css";

function formatSlotTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Presentation-only helpers for the new card design — derive an avatar
// from data we already have (name/id), since we don't store doctor photos.
function getInitials(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Soft background + matching readable text color, picked deterministically
// per doctor (by id) so the same doctor always gets the same color.
const AVATAR_PALETTE = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#dcfce7", text: "#166534" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#fef3c7", text: "#92400e" },
  { bg: "#e0e7ff", text: "#3730a3" },
  { bg: "#ccfbf1", text: "#115e59" },
];

function getAvatarColors(doctorId) {
  return AVATAR_PALETTE[doctorId % AVATAR_PALETTE.length];
}

export default function DoctorList() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Which doctor's booking form is currently open (null = none).
  const [bookingDoctorId, setBookingDoctorId] = useState(null);
  const [visitType, setVisitType] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Optional attachment (e.g. a lab report or photo) to upload right after
  // the appointment is created.
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Search/filter state — purely client-side over the already-loaded
  // doctors list.
  const [searchQuery, setSearchQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");

  useEffect(() => {
    listDoctors()
      .then(setDoctors)
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function openBookingForm(doctorId) {
    setBookingDoctorId(doctorId);
    setVisitType("");
    setDate("");
    setReason("");
    setSlots([]);
    setSelectedSlot(null);
    setFile(null);
    setFormError("");
    setSuccessMessage("");
  }

  // Changing the visit type changes how much room a slot needs, so any
  // previously-fetched date/slots no longer mean anything — same as
  // picking a new doctor, the patient re-picks a date under the new type.
  function handleVisitTypeChange(newVisitType) {
    setVisitType(newVisitType);
    setDate("");
    setSlots([]);
    setSelectedSlot(null);
  }

  function handleFileChange(e) {
    const selected = e.target.files[0] || null;
    setFormError("");

    if (selected) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(selected.type)) {
        setFormError("Only PDF, JPG, and PNG files are allowed.");
        e.target.value = "";
        setFile(null);
        return;
      }
      if (selected.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setFormError("File is too large (max 5MB).");
        e.target.value = "";
        setFile(null);
        return;
      }
    }

    setFile(selected);
  }

  // Whenever the chosen date changes, fetch that doctor's actual open
  // slots for the selected visit type on that date — this is the list
  // the patient can pick from. The backend resolves this doctor's own
  // duration for the type and returns only slots that genuinely fit.
  function handleDateChange(doctorId, newDate) {
    setDate(newDate);
    setSelectedSlot(null);
    setSlots([]);
    if (!newDate) return;

    setSlotsLoading(true);
    setFormError("");
    getAvailableSlots(doctorId, newDate, visitType)
      .then(setSlots)
      .catch((err) => setFormError(err.message))
      .finally(() => setSlotsLoading(false));
  }

  async function handleBook(e, doctorId) {
    e.preventDefault();
    setFormError("");
    if (!visitType) {
      setFormError("Please select a visit type.");
      return;
    }
    if (!selectedSlot) {
      setFormError("Please select a time slot.");
      return;
    }
    // Mirrors the backend's own check (see AppointmentCreate in
    // app/schemas.py) — a blank or single-character reason isn't
    // meaningful enough for a doctor to act on.
    if (reason.trim().length < 3) {
      setFormError("Reason for visit must be at least 3 characters long");
      return;
    }

    setSubmitting(true);
    try {
      const appointment = await bookAppointment({
        doctor_id: doctorId,
        appointment_date: selectedSlot.start_time,
        reason,
        visit_type: visitType,
      });

      // Booking is already done at this point — an upload failure below
      // shouldn't look like the whole booking failed, so it gets its own
      // message instead of going through setFormError/catch below.
      if (file) {
        try {
          await uploadAttachment(appointment.id, file);
          setSuccessMessage("Appointment booked and attachment uploaded!");
        } catch (uploadErr) {
          setSuccessMessage(
            `Appointment booked, but the attachment failed to upload: ${uploadErr.message}`
          );
        }
      } else {
        setSuccessMessage("Appointment booked!");
      }

      setBookingDoctorId(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Loading doctors...</p>;
  if (loadError) return <p className="error">{loadError}</p>;

  // Specialties actually present in the loaded list, not a hardcoded set —
  // so the dropdown always matches what's really bookable.
  const specialties = [...new Set(doctors.map((doctor) => doctor.specialization))].sort();

  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSearch = doctor.full_name
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase());
    const matchesSpecialty = !specialtyFilter || doctor.specialization === specialtyFilter;
    return matchesSearch && matchesSpecialty;
  });

  const filtersActive = searchQuery !== "" || specialtyFilter !== "";

  function handleClearFilters() {
    setSearchQuery("");
    setSpecialtyFilter("");
  }

  // A doctor is being booked — show the full-page booking view instead of
  // the grid. Same route, same component, just a different conditional
  // render branch; closing this (the back arrow) is exactly the same
  // "clear bookingDoctorId" action the old inline Cancel button did.
  const bookingDoctor = bookingDoctorId ? doctors.find((d) => d.id === bookingDoctorId) : null;

  if (bookingDoctor) {
    const avatarColors = getAvatarColors(bookingDoctor.id);
    return (
      <div className="booking-view">
        <div className="booking-header">
          <button
            type="button"
            className="booking-back-button"
            onClick={() => setBookingDoctorId(null)}
            aria-label="Back to doctors list"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
          <div>
            <h1 className="booking-heading">Book Appointment</h1>
            <p className="booking-subtitle">Select a time and provide details for your visit.</p>
          </div>
        </div>

        <div className="booking-doctor-card">
          <div
            className="doctor-avatar"
            style={{ background: avatarColors.bg, color: avatarColors.text }}
          >
            {getInitials(bookingDoctor.full_name)}
          </div>
          <div>
            <p className="booking-doctor-name">{bookingDoctor.full_name}</p>
            <div className="booking-doctor-specialty">
              <span className="material-symbols-outlined" aria-hidden="true">
                medical_services
              </span>
              {bookingDoctor.specialization}
            </div>
          </div>
        </div>

        <form onSubmit={(e) => handleBook(e, bookingDoctor.id)}>
          <div className="booking-section">
            <label className="booking-label" htmlFor="visit-type">
              Visit Type
            </label>
            <select
              id="visit-type"
              className="booking-select"
              value={visitType}
              onChange={(e) => handleVisitTypeChange(e.target.value)}
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

          <div className="booking-datetime-card">
            <div className="booking-section">
              <label className="booking-label" htmlFor="booking-date">
                Date &amp; Time
              </label>
              <input
                id="booking-date"
                className="booking-date-input"
                type="date"
                value={date}
                onChange={(e) => handleDateChange(bookingDoctor.id, e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                disabled={!visitType}
                required
              />
            </div>

            {date && (
              <div className="booking-section">
                <label className="booking-label">Available Times</label>
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
                          (selectedSlot?.start_time === slot.start_time
                            ? " booking-slot-selected"
                            : "")
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
          </div>

          <div className="booking-section">
            <label className="booking-label" htmlFor="booking-reason">
              Reason for visit
            </label>
            <textarea
              id="booking-reason"
              className="booking-textarea"
              placeholder="Briefly describe your symptoms or reason for the appointment..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className="booking-section">
            <label className="booking-label" htmlFor="booking-file">
              Attach a file (optional) — PDF, JPG, or PNG, max 5MB
            </label>
            <input
              id="booking-file"
              className="booking-file-input"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
            />
            {file && <p className="muted">Selected: {file.name}</p>}
          </div>

          {formError && <p className="error">{formError}</p>}

          <button
            type="submit"
            className="booking-submit-button"
            disabled={!selectedSlot || submitting}
          >
            {submitting ? "Booking..." : "Book Appointment"}
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="doctors-page">
      <h1 className="doctors-heading">Find Your Doctor</h1>
      <p className="doctors-subtitle">
        Book an appointment with our trusted healthcare professionals.
      </p>

      {successMessage && <p className="success">{successMessage}</p>}

      <div className="doctors-toolbar">
        <div className="doctors-search-wrap">
          <span className="material-symbols-outlined doctors-search-icon" aria-hidden="true">
            search
          </span>
          <input
            className="doctors-search-input"
            type="search"
            placeholder="Search by name or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search doctors by name"
          />
        </div>
        <select
          className="doctors-specialty-select"
          value={specialtyFilter}
          onChange={(e) => setSpecialtyFilter(e.target.value)}
          aria-label="Filter by specialty"
        >
          <option value="">All specialties</option>
          {specialties.map((specialty) => (
            <option key={specialty} value={specialty}>
              {specialty}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button type="button" className="doctors-clear-button" onClick={handleClearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {filteredDoctors.length === 0 ? (
        <p className="muted">No doctors found.</p>
      ) : (
        <div className="doctors-grid">
          {filteredDoctors.map((doctor) => {
            const avatarColors = getAvatarColors(doctor.id);
            return (
              <div className="doctor-card" key={doctor.id}>
                <div className="doctor-card-summary">
                  <div
                    className="doctor-avatar"
                    style={{ background: avatarColors.bg, color: avatarColors.text }}
                  >
                    {getInitials(doctor.full_name)}
                  </div>
                  <p className="doctor-name">{doctor.full_name}</p>
                  <div className="doctor-specialty">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      medical_services
                    </span>
                    {doctor.specialization}
                  </div>
                  <button
                    type="button"
                    className="doctor-book-button"
                    onClick={() => openBookingForm(doctor.id)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      calendar_month
                    </span>
                    Book appointment
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
