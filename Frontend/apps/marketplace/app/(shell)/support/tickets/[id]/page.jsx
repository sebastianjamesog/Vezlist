import TicketDetail from "@vezlist/shared/pages/TicketDetail.jsx";
import { tickets } from "@vezlist/shared/data/mock.js";

export function generateStaticParams() {
  return tickets.map(({ id }) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ticket = tickets.find((t) => t.id === id);
  return ticket
    ? { title: `${ticket.title} — Support`, robots: { index: false } }
    : { title: "Ticket not found" };
}

export default function Page() {
  return <TicketDetail />;
}
