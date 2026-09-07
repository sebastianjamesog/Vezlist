"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import TopBar from "@vezlist/shared/components/layout/TopBar.jsx";
import PageBody from "@vezlist/shared/components/layout/PageBody.jsx";
import LocationBar from "@vezlist/shared/components/LocationBar.jsx";
import { useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { SITE_NAME } from "@vezlist/shared/lib/sites.js";
import CategoryGrid from "./CategoryGrid.jsx";

/**
 * The front door. Two questions and nothing else: where you are, and what you
 * are looking for. Answering the second one hands you to /browse with that
 * category already applied — the feed, search and filters all live there.
 */
export default function Home() {
  const { filters, setFilters } = useFeed();
  const patch = (next) => setFilters((f) => ({ ...f, ...next }));

  return (
    <>
      <TopBar title="Home" />

      <PageBody className="px-4 pb-8 lg:px-8">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="brand-gradient bg-clip-text py-7 text-center text-[44px] font-extrabold tracking-tight text-transparent lg:py-10 lg:text-[56px]">
            {SITE_NAME}
          </h1>

          <LocationBar variant="card" filters={filters} onPatch={patch} />

          <div className="mt-5">
            <CategoryGrid />
          </div>

          {/* Nine tiles is not nineteen categories — this is the way to the
              rest of them, and to the feed with nothing narrowed at all. */}
          <Link
            href="/browse"
            className="mt-5 flex items-center justify-center gap-1.5 rounded-card bg-surface py-3.5 text-[15px] font-semibold text-brand shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            Browse all ads
            <ArrowRight className="size-4" strokeWidth={2.4} />
          </Link>
        </div>
      </PageBody>
    </>
  );
}
