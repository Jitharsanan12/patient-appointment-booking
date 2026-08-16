/*
  Doctor settings page: availability windows, per-visit-type durations,
  and one-off blocked dates — split out from the main schedule page so
  each doctor page has a single focus. All three sections and the
  doctorId fetch behave exactly as they did on the combined dashboard.
*/

import { useEffect, useState } from "react";
import { getMyDoctorProfile } from "../api/client";
import AvailabilityManager from "../components/AvailabilityManager";
import UnavailableDatesManager from "../components/UnavailableDatesManager";
import VisitTypeDurations from "../components/VisitTypeDurations";
import "./AuthPages.css";
import "./DoctorDashboard.css";

export default function DoctorSettings() {
  const [doctorId, setDoctorId] = useState(null);

  useEffect(() => {
    getMyDoctorProfile().then((profile) => setDoctorId(profile.id));
  }, []);

  return (
    <div className="dashboard-page">
      <h2 className="dashboard-heading">Settings</h2>

      {doctorId ? (
        <div className="settings-layout">
          <div className="settings-area-availability">
            <AvailabilityManager doctorId={doctorId} />
          </div>
          <div className="settings-area-durations">
            <VisitTypeDurations doctorId={doctorId} />
          </div>
          <div className="settings-area-blockdate">
            <UnavailableDatesManager doctorId={doctorId} />
          </div>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
