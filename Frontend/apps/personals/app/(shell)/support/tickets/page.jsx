import Tickets from "@vezlist/shared/pages/Tickets.jsx";
import RequireAuth from "@vezlist/shared/components/RequireAuth.jsx";

export default function Page() {
  return <RequireAuth><Tickets /></RequireAuth>;
}
