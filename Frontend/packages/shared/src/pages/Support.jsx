"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopBar from "../components/layout/TopBar";
import PageBody from "../components/layout/PageBody";
import Accordion from "../components/ui/Accordion";
import Button from "../components/ui/Button";
import { LEGAL_LINKS } from "../components/layout/legalLinks";
import { useTickets } from "../context/TicketsContext";
import { listArticles } from "../lib/api/articles.js";
import { SITE_NAME } from "../lib/sites";

export default function Support() {
  const { tickets, ready: ticketsReady, error: ticketsError, refresh: refreshTickets } = useTickets();
  const [articles, setArticles] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articlesError, setArticlesError] = useState(null);

  const refreshArticles = useCallback(async () => {
    setLoadingArticles(true);
    setArticlesError(null);
    try {
      const page = await listArticles({ limit: 5 });
      setArticles(page.items);
    } catch (caught) {
      setArticlesError(caught);
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  useEffect(() => { refreshArticles(); }, [refreshArticles]);

  return (
    <>
      <TopBar title="Support" />
      <PageBody className="px-4 pb-8 pt-top lg:px-8 lg:py-6">
        <section className="brand-gradient rounded-card p-5 text-on-brand shadow-lift lg:p-8">
          <h1 className="text-[28px] font-extrabold leading-tight lg:text-[38px]">How can we help?</h1>
          <p className="mt-1.5 text-[14px] text-on-brand/80 lg:text-[16px]">Find an answer or send us a support ticket.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button to="/support/faqs" variant="outline">Browse help articles</Button>
            <Button to="/support/tickets">Open a ticket</Button>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-ink">Your tickets</h2>
              <Link href="/support/tickets" className="text-sm font-bold text-brand hover:underline">View all</Link>
            </div>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {!ticketsReady ? <p role="status" className="p-4 text-sm text-muted">Loading tickets…</p> : ticketsError ? (
                <div role="alert" className="p-4 text-sm text-muted">Could not load tickets. <button type="button" onClick={refreshTickets} className="font-bold text-brand hover:underline">Try again</button></div>
              ) : tickets.length ? tickets.slice(0, 3).map((ticket) => (
                <Link key={ticket.id} href={`/support/tickets/${ticket.id}`} className="flex items-center justify-between gap-3 border-b border-line p-4 last:border-0 hover:bg-canvas">
                  <span className="min-w-0"><span className="block truncate font-bold text-ink">{ticket.title}</span><span className="text-xs text-muted">{ticket.meta}</span></span>
                  <span className="shrink-0 text-xs font-semibold text-brand">{ticket.status}</span>
                </Link>
              )) : <p className="p-4 text-sm text-muted">No tickets yet.</p>}
            </div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-ink">Help articles</h2>
              <Link href="/support/faqs" className="text-sm font-bold text-brand hover:underline">All articles</Link>
            </div>
            {loadingArticles ? <p role="status" className="text-sm text-muted">Loading articles…</p> : articlesError ? (
              <div role="alert" className="text-sm text-muted">Could not load articles. <button type="button" onClick={refreshArticles} className="font-bold text-brand hover:underline">Try again</button></div>
            ) : articles.length ? <Accordion items={articles} /> : <p className="rounded-card bg-surface p-4 text-sm text-muted shadow-card">No help articles have been published yet.</p>}
          </section>
        </div>

        <section className="mt-8 lg:hidden">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-[12px] font-semibold text-muted">
            {LEGAL_LINKS.map((link) => <Link key={link.href} href={link.href} className="hover:text-ink hover:underline">{link.label}</Link>)}
            <span className="font-medium text-muted/70">&copy; {new Date().getFullYear()} {SITE_NAME}</span>
          </div>
        </section>
      </PageBody>
    </>
  );
}
