import CreatorDashboard from "@vezlist/shared/pages/CreatorDashboard.jsx";
import RequireCapability from "@vezlist/shared/components/RequireCapability.jsx";

export default function Page() {
  return (
    <RequireCapability capability="dashboard.view" title="Creator dashboard">
      <CreatorDashboard />
    </RequireCapability>
  );
}
