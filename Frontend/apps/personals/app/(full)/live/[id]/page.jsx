import LiveViewer from "@vezlist/shared/pages/LiveViewer.jsx";
export const metadata = {
  title: "Watch live",
  description: "Watch a live creator on Vezlist Personals.",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <LiveViewer />;
}
