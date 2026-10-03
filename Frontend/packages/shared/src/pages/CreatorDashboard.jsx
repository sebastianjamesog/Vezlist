"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { useShell } from "../components/layout/AppLayout";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import MediaImage from "../components/media/MediaImage.jsx";
import StatCard from "../components/admin/StatCard";
import { SITE_SCOPE } from "../lib/api/client.js";
import { ownedListings } from "../lib/api/listings.js";

export default function CreatorDashboard() {
  const { openPost } = useShell();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await ownedListings(SITE_SCOPE));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalSaves = rows.reduce((total, row) => total + row.saveCount, 0);
  const activeAds = rows.filter((row) => row.status === "ACTIVE").length;
  const recentAds = [...rows]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  return (
    <>
      <SubPageBar title="Creator dashboard" subtitle="Your ads at a glance" fallback="/profile" />
      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        {loading ? (
          <p className="text-sm text-muted" role="status">Loading your ads…</p>
        ) : error ? (
          <div role="alert" className="rounded-card bg-surface p-5 shadow-card">
            <p className="font-semibold text-ink">Could not load your dashboard.</p>
            <Button onClick={refresh} className="mt-3">Try again</Button>
          </div>
        ) : rows.length ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Total saves" value={totalSaves.toLocaleString()} icon="Heart" tone="rose" to="/profile/ads" />
              <StatCard label="Active ads" value={activeAds} icon="Megaphone" tone="green" to="/profile/ads" />
              <StatCard label="All ads" value={rows.length} icon="List" tone="blue" to="/profile/ads" />
            </div>
            <section className="mt-4 rounded-card bg-surface p-4 shadow-card lg:p-5">
              <h2 className="text-[17px] font-extrabold text-ink">Recently updated ads</h2>
              <ul className="mt-2 divide-y divide-line">
                {recentAds.map((row) => (
                  <li key={row.id}>
                    <Link href={row.status === "ACTIVE" ? `/ad/${row.id}` : "/profile/ads"} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-canvas">
                      <MediaImage src={row.media?.[0]?.url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-xl object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold text-ink">{row.title}</span>
                        <span className="block text-[12.5px] text-muted">{row.status.replaceAll("_", " ").toLowerCase()} · {row.saveCount} saves</span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/profile/ads" className="mt-3 inline-block text-[13px] font-bold text-brand hover:underline">Manage all ads</Link>
            </section>
          </>
        ) : (
          <EmptyState icon="ChartNoAxesCombined" title="Nothing to measure yet" body="Your ads and saves appear here once you post." action={<Button onClick={openPost}>Post your first ad</Button>} />
        )}
      </PageBody>
    </>
  );
}
