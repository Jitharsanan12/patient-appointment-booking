import ManageDoctors from "../components/ManageDoctors";
import "./DoctorDashboard.css";

export default function AdminDoctors() {
  return (
    <div className="dashboard-page">
      <h2 className="dashboard-heading">Manage Doctors</h2>
      <ManageDoctors />
    </div>
  );
}
