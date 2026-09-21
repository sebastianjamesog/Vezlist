"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, MessageSquare, Search } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import PageBody from "../components/layout/PageBody";
import Accordion from "../components/ui/Accordion";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import { LEGAL_LINKS } from "../components/layout/legalLinks";
import { contactChannels, faqs, supportTopics, tickets } from "../data/mock";
import { SITE_NAME } from "../lib/sites";
import { tones } from "../lib/tones";

function Eyebrow({ children, action }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Channel card. `to` stays in-app; `href` hands off to the device. */
function Channel({ channel }) {
  const body = (
    <>
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${tones[channel.tone]}`}
      >
        <Icon name={channel.icon} className="size-5" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight text-ink">
          {channel.label}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">
          {channel.meta}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" />
    </>
  );

  const className =
    "flex items-center gap-3 rounded-card bg-surface p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift";

  return channel.to ? (
    <Link href={channel.to} className={className}>
      {body}
    </Link>
  ) : (
    <a
      href={channel.href}
      target={channel.href.startsWith("http") ? "_blank" : undefined}
      rel={channel.href.startsWith("http") ? "noreferrer" : undefined}
      className={className}
    >
      {body}
    </a>
  );
}

export default function Support() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = faqs.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(q));
  const searching = q.length > 0;
  const open = tickets.filter((t) => t.status !== "Resolved").length;

  return (
    <>
      <TopBar title="Support" />

      <PageBody className="px-4 pb-8 pt-top lg:px-8 lg:py-6">
        {/* Hero owns the search and says how fast a human answers. */}
        <section className="brand-gradient relative overflow-hidden rounded-card p-5 shadow-lift lg:p-8">
          <span
            aria-hidden="true"
            className="absolute -right-16 -top-20 size-56 rounded-full bg-on-brand/20 blur-3xl"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-24 -left-10 size-56 rounded-full bg-on-brand/10 blur-3xl"
          />

          <div className="relative lg:mx-auto lg:max-w-2xl lg:text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-on-brand/15 px-3 py-1.5 text-[12px] font-bold text-on-brand backdrop-blur-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              Support is online
            </span>

            <h1 className="mt-3 text-[28px] font-extrabold leading-tight text-on-brand lg:text-[38px]">
              How can we help?
            </h1>
            <p className="mt-1.5 text-[14px] text-on-brand/80 lg:text-[16px]">
              Search the help centre, or talk to a person in about two minutes.
            </p>

            <label className="mt-4 flex h-12 items-center gap-3 rounded-2xl bg-surface px-4 shadow-lift lg:h-14 lg:px-5">
              <Search
                className="size-[18px] shrink-0 text-muted"
                strokeWidth={2.4}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help articles…"
                className="w-full bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-muted"
              />
            </label>
          </div>
        </section>

        {searching ? (
          /* Searching collapses the page to one job: answers. */
          <section className="mt-6">
            <Eyebrow
              action={
                <button
                  onClick={() => setQuery("")}
                  className="text-[13px] font-bold text-brand hover:underline"
                >
                  Clear
                </button>
              }
            >
              {matches.length} {matches.length === 1 ? "result" : "results"} for
              “{query}”
            </Eyebrow>

            {matches.length ? (
              <Accordion items={matches} />
            ) : (
              <div className="rounded-card bg-surface p-6 text-center shadow-card">
                <p className="text-[16px] font-bold text-ink">
                  No article matches that.
                </p>
                <p className="mt-1 text-[14px] text-muted">
                  Search the full help centre, or open a ticket and we'll
                  answer.
                </p>
                <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                  <Button to="/support/faqs" variant="outline">
                    All articles
                  </Button>
                  <Button to="/support/tickets">Open a ticket</Button>
                </div>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="lg:grid lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-8">
              <div>
                <section className="mt-6">
                  <Eyebrow>Talk to us</Eyebrow>
                  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    {contactChannels.map((c) => (
                      <Channel key={c.id} channel={c} />
                    ))}
                  </div>
                </section>

                <section className="mt-6">
                  <Eyebrow>Browse by topic</Eyebrow>
                  <div className="grid grid-cols-2 gap-2.5">
                    {supportTopics.map((t) => (
                      <Link
                        key={t.id}
                        href={t.to}
                        className="group rounded-card bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                      >
                        <span className="grid size-10 place-items-center rounded-2xl bg-brand-soft text-brand transition-colors group-hover:brand-gradient group-hover:text-on-brand">
                          <Icon
                            name={t.icon}
                            className="size-5"
                            strokeWidth={2.3}
                          />
                        </span>
                        <p className="mt-3 text-[15px] font-bold text-ink">
                          {t.label}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-muted">
                          {t.sub}
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>

              <div>
                <section className="mt-6">
                  <Eyebrow
                    action={
                      <Link
                        href="/support/tickets"
                        className="text-[13px] font-bold text-brand hover:underline"
                      >
                        View all
                      </Link>
                    }
                  >
                    Your tickets{open ? ` · ${open} open` : ""}
                  </Eyebrow>

                  <div className="overflow-hidden rounded-card bg-surface shadow-card">
                    {tickets.map((t, i) => {
                      const resolved = t.status === "Resolved";
                      return (
                        <Link
                          key={t.id}
                          href={`/support/tickets/${t.id}`}
                          className={`flex items-center gap-3 p-4 transition-colors hover:bg-canvas ${
                            i ? "border-t border-line" : ""
                          }`}
                        >
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-2xl ${
                              resolved
                                ? "bg-canvas text-muted"
                                : "bg-brand-soft text-brand"
                            }`}
                          >
                            <Icon
                              name={t.icon}
                              className="size-5"
                              strokeWidth={2.3}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-bold leading-tight text-ink">
                              {t.title}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-muted">
                              {t.meta}
                            </span>
                          </span>
                          <span
                            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              resolved
                                ? "bg-canvas text-muted"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {!resolved && (
                              <span className="size-1.5 rounded-full bg-amber-500" />
                            )}
                            {t.status}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>

                <section className="mt-6">
                  <Eyebrow
                    action={
                      <Link
                        href="/support/faqs"
                        className="text-[13px] font-bold text-brand hover:underline"
                      >
                        All articles
                      </Link>
                    }
                  >
                    Popular questions
                  </Eyebrow>
                  <Accordion items={faqs} />
                </section>
              </div>
            </div>

            {/* Last resort, and the only full-width block on the page. */}
            <section className="mt-6 flex flex-col gap-4 rounded-card bg-ink p-5 text-canvas shadow-lift sm:flex-row sm:items-center lg:p-6">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-canvas/10">
                <MessageSquare className="size-6" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold">Still stuck?</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-canvas/70">
                  Open a ticket with your ad link and a screenshot — most are
                  answered the same day.
                </p>
              </div>
              <Link
                href="/support/tickets"
                className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-canvas px-5 text-[15px] font-bold text-ink transition-transform hover:scale-[1.02] active:scale-95"
              >
                Open a ticket
                <ArrowRight className="size-4" strokeWidth={2.6} />
              </Link>
            </section>
          </>
        )}

        {/*
          The signed-out route to the legal pages on a phone.

          `Settings` carries these too, but everything under `/profile` sits
          behind `RequireAuth`, so that copy is reachable only once you have an
          account — and the reader most likely to want the terms is the one who
          has not agreed to them yet. Support is a tab in the bar on both
          boards and needs no session, which makes it the one public screen
          that can hold them. Desktop draws `Footer` instead, hence `lg:hidden`.

          Outside the search branch on purpose: these are still the right links
          when a search has come back with nothing.
        */}
        <section className="mt-8 lg:hidden">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-line pt-4 text-[12px] font-semibold text-muted">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-ink hover:underline"
              >
                {link.label}
              </Link>
            ))}
            <span className="font-medium text-muted/70">
              &copy; {new Date().getFullYear()} {SITE_NAME}
            </span>
          </div>
        </section>
      </PageBody>
    </>
  );
}
