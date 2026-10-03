import StatusViewer from "@vezlist/shared/pages/StatusViewer.jsx";

export const metadata = {
  title: "Stories",
  description:
    "Watch the latest stories on Vezlist Personals. Stories are available for 24 hours.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <StatusViewer />;
}
