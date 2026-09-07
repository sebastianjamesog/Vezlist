"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import { tickets } from "../data/mock";

const tabs = [
  { value: "all", label: "All" },
  { value: "In Progress", label: "Open" },
  { value: "Resolved", label: "Resolved" },
];

export default function Tickets() {
  const [tab, setTab] = useState("all");
  const rows =
    tab === "all" ? tickets : tickets.filter((t) => t.status === tab);

  return (
    <>
      <SubPageBar
        title="Support Tickets"
        subtitle={`${tickets.length} total`}
        fallback="/support"
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="mb-4 flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line lg:max-w-md">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              aria-pressed={tab === t.value}
              className={`flex-1 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                tab === t.value
                  ? "bg-brand text-on-brand"
                  : "text-ink hover:bg-canvas"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {rows.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((t) => (
              <Link
                key={t.id}
                href={`/support/tickets/${t.id}`}
                className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-lift"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                  <Icon name={t.icon} className="size-5" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-tight text-ink">
                    {t.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    {t.meta}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                    t.status === "Resolved"
                      ? "bg-canvas text-muted"
                      : "bg-brand-soft text-brand"
                  }`}
                >
                  {t.status}
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="ReceiptText"
            title="No tickets here"
            body="Nothing in this status yet."
          />
        )}
      </PageBody>
    </>
  );
}
