import PatientsList from "../components/PatientsList";
import "./DoctorDashboard.css";

export default function AdminPatients() {
  return (
    <div className="dashboard-page">
      <h2 className="dashboard-heading">Patients</h2>
      <PatientsList />
    </div>
  );
}
