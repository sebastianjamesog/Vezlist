import GoLive from "@vezlist/shared/pages/GoLive.jsx";

// A static segment beside `[id]`, so `/live/start` resolves here rather than
// being read as a broadcast with the id "start".
export const metadata = {
  title: "Go live",
  description: "Start a broadcast on Vezlist Personals.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <GoLive />;
}
