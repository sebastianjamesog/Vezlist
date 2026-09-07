"use client";

import { useState } from "react";
import { useSearchParams } from "../lib/nav";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import SearchBar from "../components/ui/SearchBar";
import Accordion from "../components/ui/Accordion";
import EmptyState from "../components/ui/EmptyState";
import { allFaqs, faqCategories } from "../data/mock";

export default function Faqs() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const requested = params.get("cat");
  const category = faqCategories.includes(requested) ? requested : "All";
  const setCategory = (c) => setParams(c === "All" ? {} : { cat: c });

  const q = query.trim().toLowerCase();
  const visible = allFaqs.filter(
    (f) =>
      (category === "All" || f.category === category) &&
      (!q || `${f.q} ${f.a}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <SubPageBar
        title="Help Centre"
        subtitle={`${allFaqs.length} articles`}
        fallback="/support"
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <SearchBar
          className="rounded-2xl"
          placeholder="Search help articles..."
          value={query}
          onChange={setQuery}
        />

        <div className="no-scrollbar -mx-4 mt-3 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {["All", ...faqCategories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
                category === c
                  ? "brand-gradient border-transparent text-on-brand shadow-pop"
                  : "border-line bg-surface text-ink hover:border-ink/20"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {visible.length ? (
          <div className="lg:max-w-3xl">
            <Accordion items={visible} />
          </div>
        ) : (
          <EmptyState
            icon="SearchX"
            title="No articles found"
            body="Try a different search or pick another category."
          />
        )}
      </PageBody>
    </>
  );
}
