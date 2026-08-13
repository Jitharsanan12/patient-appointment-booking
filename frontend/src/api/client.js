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

// ---------- Doctors ----------

export function listDoctors() {
  return request("/doctors");
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
