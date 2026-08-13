/*
  Home page for patients: shows every doctor, with a "Book" button that
  opens a small inline form to pick a date/time and reason.
*/

import { useEffect, useState } from "react";
import { listDoctors, bookAppointment } from "../api/client";

export default function DoctorList() {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Which doctor's booking form is currently open (null = none).
  const [bookingDoctorId, setBookingDoctorId] = useState(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
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
    setFormError("");
    setSuccessMessage("");
  }

  async function handleBook(e, doctorId) {
    e.preventDefault();
    setFormError("");
    try {
      // <input type="datetime-local"> gives a value like "2026-09-01T10:00"
      // with no timezone. new Date(...).toISOString() converts it to a
      // proper UTC timestamp the backend expects.
      const isoDate = new Date(date).toISOString();
      await bookAppointment({ doctor_id: doctorId, appointment_date: isoDate, reason });
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
                  Date & time
                  <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>
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
                  <button type="submit">Confirm booking</button>
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
