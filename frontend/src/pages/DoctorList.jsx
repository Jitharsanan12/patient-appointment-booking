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
} from "../api/client";

function formatSlotTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DoctorList() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Which doctor's booking form is currently open (null = none).
  const [bookingDoctorId, setBookingDoctorId] = useState(null);
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
    setDate("");
    setReason("");
    setSlots([]);
    setSelectedSlot(null);
    setFile(null);
    setFormError("");
    setSuccessMessage("");
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
  // slots for it — this is the list the patient can pick from.
  function handleDateChange(doctorId, newDate) {
    setDate(newDate);
    setSelectedSlot(null);
    setSlots([]);
    if (!newDate) return;

    setSlotsLoading(true);
    setFormError("");
    getAvailableSlots(doctorId, newDate)
      .then(setSlots)
      .catch((err) => setFormError(err.message))
      .finally(() => setSlotsLoading(false));
  }

  async function handleBook(e, doctorId) {
    e.preventDefault();
    setFormError("");
    if (!selectedSlot) {
      setFormError("Please select a time slot.");
      return;
    }

    setSubmitting(true);
    try {
      const appointment = await bookAppointment({
        doctor_id: doctorId,
        appointment_date: selectedSlot.start_time,
        reason,
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

  return (
    <div>
      <h2>Doctors</h2>
      {successMessage && <p className="success">{successMessage}</p>}

      <div className="doctor-filters">
        <input
          type="search"
          placeholder="Search by doctor name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search doctors by name"
        />
        <select
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
          <button type="button" onClick={handleClearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {filteredDoctors.length === 0 ? (
        <p className="muted">No doctors found.</p>
      ) : (
        <div className="card-list">
          {filteredDoctors.map((doctor) => (
            <div className="card" key={doctor.id}>
              <h3>{doctor.full_name}</h3>
              <p>{doctor.specialization}</p>
              {doctor.bio && <p className="muted">{doctor.bio}</p>}

              {bookingDoctorId === doctor.id ? (
                <form onSubmit={(e) => handleBook(e, doctor.id)}>
                  <label>
                    Date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => handleDateChange(doctor.id, e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </label>

                  {date && (
                    <div>
                      <label>Available times</label>
                      {slotsLoading ? (
                        <p className="muted">Loading slots...</p>
                      ) : slots.length === 0 ? (
                        <p className="muted">
                          No open slots on this date. Try another date.
                        </p>
                      ) : (
                        <div className="slot-grid">
                          {slots.map((slot) => (
                            <button
                              type="button"
                              key={slot.start_time}
                              className={
                                "slot-button" +
                                (selectedSlot?.start_time === slot.start_time ? " slot-selected" : "")
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

                  <label>
                    Reason
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Attach a file (optional) — PDF, JPG, or PNG, max 5MB
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={handleFileChange}
                    />
                  </label>
                  {file && <p className="muted">Selected: {file.name}</p>}
                  {formError && <p className="error">{formError}</p>}
                  <div className="button-row">
                    <button type="submit" disabled={!selectedSlot || submitting}>
                      {submitting ? "Booking..." : "Confirm booking"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingDoctorId(null)}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => openBookingForm(doctor.id)}>Book appointment</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
