import SubPageBar from "@vezlist/shared/components/layout/SubPageBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import TrendingGrid from "./TrendingGrid.jsx";

export const metadata = {
  title: "Trending",
  description: "The most viewed and most liked creators on Vezlist Personals.",
};

export default function Trending() {
  return (
    <>
      <SubPageBar title="Trending" subtitle="Most viewed & liked creators" />

      <PageBody className="px-4 pb-8 lg:px-8">
        <TrendingGrid />
      </PageBody>
    </>
  );
}
