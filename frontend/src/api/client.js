/*
  Central place for all communication with the backend API.
  Every other file in the app calls functions from here instead of
  using fetch() directly, so there's one place that knows about URLs,
  auth headers, and error handling.
*/

// Read the backend's URL from the frontend's own .env file (see
// frontend/.env). Vite only exposes env vars prefixed with VITE_.
const API_URL = import.meta.env.VITE_API_URL;

// The JWT we get back from /auth/login is stored in the browser's
// localStorage so the user stays logged in after refreshing the page.
export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

/*
  A small wrapper around fetch() that:
  - prefixes the backend URL
  - attaches the JWT (if we have one) as an Authorization header
  - throws a JS Error with the backend's error message if the request failed,
    so calling code can just try/catch instead of checking response.ok every time
*/
async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `Request failed (${response.status})`);
  }

  // Some endpoints (like DELETE) may not return a body.
  if (response.status === 204) return null;
  return response.json();
}

// ---------- Auth ----------

export function registerUser(data) {
  return request("/auth/register", { method: "POST", body: data });
}

export function loginUser(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

export function getMe() {
  return request("/auth/me");
}

export function changePassword(currentPassword, newPassword) {
  return request("/auth/me/password", {
    method: "PUT",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

// ---------- Doctors ----------

export function listDoctors() {
  return request("/doctors");
}

export function getMyDoctorProfile() {
  return request("/doctors/me");
}

// ---------- Admin ----------

export function createDoctorAsAdmin(data) {
  return request("/admin/doctors", { method: "POST", body: data });
}

export function adminCancelAppointment(id) {
  return request(`/appointments/${id}/admin-cancel`, { method: "POST" });
}

export function adminBookAppointment(data) {
  return request("/admin/appointments", { method: "POST", body: data });
}

export function listPatients() {
  return request("/admin/patients");
}

export function getPatientAppointmentHistory(patientId) {
  return request(`/admin/patients/${patientId}`);
}

// ---------- Availability ----------

export function listAvailability(doctorId) {
  return request(`/doctors/${doctorId}/availability`);
}

export function createAvailability(doctorId, data) {
  return request(`/doctors/${doctorId}/availability`, { method: "POST", body: data });
}

export function updateAvailability(doctorId, availabilityId, data) {
  return request(`/doctors/${doctorId}/availability/${availabilityId}`, {
    method: "PUT",
    body: data,
  });
}

export function deleteAvailability(doctorId, availabilityId) {
  return request(`/doctors/${doctorId}/availability/${availabilityId}`, { method: "DELETE" });
}

export function getAvailableSlots(doctorId, date) {
  return request(`/doctors/${doctorId}/available-slots?date=${date}`);
}

// ---------- Unavailable dates (one-off overrides) ----------

export function listUnavailableDates(doctorId) {
  return request(`/doctors/${doctorId}/unavailable-dates`);
}

export function createUnavailableDate(doctorId, data) {
  return request(`/doctors/${doctorId}/unavailable-dates`, { method: "POST", body: data });
}

export function deleteUnavailableDate(doctorId, overrideId) {
  return request(`/doctors/${doctorId}/unavailable-dates/${overrideId}`, { method: "DELETE" });
}

// ---------- Appointments ----------

export function bookAppointment(data) {
  return request("/appointments", { method: "POST", body: data });
}

export function myUpcomingAppointments() {
  return request("/appointments/me");
}

export function cancelAppointment(id) {
  return request(`/appointments/${id}/cancel`, { method: "POST" });
}

export function myAssignedAppointments() {
  return request("/appointments/doctor/me");
}

export function updateAppointmentStatus(id, status) {
  return request(`/appointments/${id}/status`, { method: "PATCH", body: { status } });
}

export function listAllAppointments() {
  return request("/appointments");
}

// ---------- Attachments ----------

// Client-side mirror of the backend's validation (see s3_utils.py), so the
// UI can reject an obviously-bad file immediately instead of waiting on a
// round trip — the backend still re-checks both on upload, since a client
// check can always be bypassed.
export const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// File uploads use multipart/form-data (a FormData body), not JSON, so this
// can't go through the shared request() helper above — that always sends
// "Content-Type: application/json" and JSON.stringifies the body. Here we
// let the browser set Content-Type itself: it needs to add a random
// "boundary" value that separates the file's raw bytes within the request,
// which we have no reason to generate by hand.
export async function uploadAttachment(appointmentId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const headers = {};
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/appointments/${appointmentId}/attachment`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

// Asks the backend for a fresh, short-lived presigned S3 URL for this
// appointment's attachment. Fetched on demand (not stored) since it
// expires a few minutes after being issued.
export function getAttachmentDownloadUrl(appointmentId) {
  return request(`/appointments/${appointmentId}/attachment`);
}

// ---------- Patient profile ----------

export function getMyProfile() {
  return request("/patients/me/profile");
}

export function updateMyProfile(data) {
  return request("/patients/me/profile", { method: "PUT", body: data });
}

// patientId is the patient's USER id (same id as appointment.patient_id).
// Backend restricts this to a doctor who has an appointment with that
// patient, or an admin.
export function getPatientProfile(patientId) {
  return request(`/patients/${patientId}/profile`);
}
