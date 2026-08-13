/*
  Home page for patients: shows every doctor, with a "Book" button that
  opens a booking flow: pick a date, then pick one of the doctor's actual
  open time slots for that date (fetched from the backend), then confirm.
*/

import { useEffect, useState } from "react";
import { listDoctors, bookAppointment, getAvailableSlots } from "../api/client";

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

  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
    setFormError("");
    setSuccessMessage("");
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
    try {
      await bookAppointment({
        doctor_id: doctorId,
        appointment_date: selectedSlot.start_time,
        reason,
      });
      setSuccessMessage("Appointment booked!");
      setBookingDoctorId(null);
    } catch (err) {
      setFormError(err.message);
    }
  }

  if (loading) return <p>Loading doctors...</p>;
  if (loadError) return <p className="error">{loadError}</p>;

  return (
    <div>
      <h2>Doctors</h2>
      {successMessage && <p className="success">{successMessage}</p>}
      <div className="card-list">
        {doctors.map((doctor) => (
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
                {formError && <p className="error">{formError}</p>}
                <div className="button-row">
                  <button type="submit" disabled={!selectedSlot}>
                    Confirm booking
                  </button>
                  <button type="button" onClick={() => setBookingDoctorId(null)}>
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
    </div>
  );
}
