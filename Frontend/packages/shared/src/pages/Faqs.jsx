"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "../lib/nav";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import SearchBar from "../components/ui/SearchBar";
import Accordion from "../components/ui/Accordion";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { listArticles } from "../lib/api/articles.js";

export default function Faqs() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const category = params.get("cat") || "All";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listArticles();
      setArticles(page.items);
      setNextOffset(page.nextOffset);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function loadMore() {
    if (nextOffset == null) return;
    try {
      const page = await listArticles({ offset: nextOffset });
      setArticles((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
    } catch (caught) {
      setError(caught);
    }
  }

  const categories = [...new Set(articles.map((article) => article.category))];
  const q = query.trim().toLowerCase();
  const visible = articles.filter((article) =>
    (category === "All" || article.category === category) &&
    (!q || `${article.q} ${article.a}`.toLowerCase().includes(q)));

  return (
    <>
      <SubPageBar title="Help Centre" subtitle={`${articles.length} articles`} fallback="/support" />
      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <SearchBar className="rounded-2xl" placeholder="Search help articles..." value={query} onChange={setQuery} />
        <div className="no-scrollbar -mx-4 mt-3 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          {["All", ...categories].map((name) => (
            <button key={name} type="button" onClick={() => setParams(name === "All" ? {} : { cat: name })} aria-pressed={category === name} className={`shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${category === name ? "brand-gradient border-transparent text-on-brand shadow-pop" : "border-line bg-surface text-ink hover:border-ink/20"}`}>{name}</button>
          ))}
        </div>
        {loading ? <p role="status" className="text-muted">Loading articles…</p> : error ? (
          <div role="alert"><p className="text-danger">Could not load articles.</p><Button onClick={refresh}>Try again</Button></div>
        ) : visible.length ? (
          <div className="lg:max-w-3xl"><Accordion items={visible} />{nextOffset != null && <Button className="mt-4" onClick={loadMore}>Load more</Button>}</div>
        ) : (
          <EmptyState icon="SearchX" title="No articles found" body="Try another search or open a support ticket." action={<Button to="/support/tickets">Support tickets</Button>} />
        )}
      </PageBody>
    </>
  );
}
