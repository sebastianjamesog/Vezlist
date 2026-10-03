import TicketDetail from "@vezlist/shared/pages/TicketDetail.jsx";
import RequireAuth from "@vezlist/shared/components/RequireAuth.jsx";

export const metadata = { title: "Support ticket", robots: { index: false } };

export default function Page() {
  return <RequireAuth><TicketDetail /></RequireAuth>;
}
