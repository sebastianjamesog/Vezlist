import StatusViewer from "@vezlist/shared/pages/StatusViewer.jsx";
import { stories } from "@vezlist/shared/data/mock.js";

export function generateStaticParams() {
  return stories.map(({ id }) => ({ id }));
}

export default function Page() {
  return <StatusViewer />;
}
