"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Heart, Megaphone, Pencil, Trash2 } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useToast } from "../context/ToastContext";
import { adStatuses, listings, myAds } from "../data/mock";

const statusTone = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  expired: "bg-canvas text-muted",
};

export default function MyAds() {
  const toast = useToast();
  const [tab, setTab] = useState("active");
  const [ads, setAds] = useState(myAds);
  const [pendingDelete, setPendingDelete] = useState(null);

  const rows = ads
    .filter((a) => a.status === tab)
    .map((a) => ({ ...a, listing: listings.find((l) => l.id === a.listingId) }))
    .filter((a) => a.listing);

  function confirmDelete() {
    setAds((s) => s.filter((a) => a.id !== pendingDelete.id));
    setPendingDelete(null);
    toast("Ad deleted");
  }

  return (
    <>
      <SubPageBar
        title="My Ads"
        subtitle={`${ads.length} listings`}
        fallback="/profile"
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="mb-4 flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line lg:max-w-md">
          {adStatuses.map((s) => {
            const count = ads.filter((a) => a.status === s.value).length;
            return (
              <button
                key={s.value}
                onClick={() => setTab(s.value)}
                aria-pressed={tab === s.value}
                className={`flex-1 rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                  tab === s.value
                    ? "bg-surface text-ink shadow-card"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s.label} ({count})
              </button>
            );
          })}
        </div>

        {rows.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((row) => (
              <article
                key={row.id}
                className="rounded-card bg-surface p-3 shadow-card lg:p-4"
              >
                <div className="flex gap-3">
                  <Link href={`/ad/${row.listing.adId}`} className="shrink-0">
                    <img
                      src={row.listing.image}
                      alt=""
                      loading="lazy"
                      className="size-[72px] rounded-xl object-cover"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/ad/${row.listing.adId}`}
                        className="text-[16px] font-bold leading-tight text-ink hover:text-brand"
                      >
                        {row.listing.title}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[row.status]}`}
                      >
                        {adStatuses.find((s) => s.value === row.status)?.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                      <span className="flex items-center gap-1">
                        <Eye className="size-4" />
                        {row.views.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="size-4" />
                        {row.saves}
                      </span>
                      {row.status === "active" && (
                        <span>Expires in {row.expiresInDays} days</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <button
                    onClick={() => toast("Editing is not wired up yet")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => toast("Promotion costs 20 credits")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-soft py-2.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                  >
                    <Megaphone className="size-4" />
                    Promote
                  </button>
                  <button
                    onClick={() => setPendingDelete(row)}
                    aria-label={`Delete ${row.listing.title}`}
                    className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-red-500 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="Megaphone"
            title={`No ${adStatuses.find((s) => s.value === tab)?.label.toLowerCase()} ads`}
            body="Ads you post show up here with their views and saves."
          />
        )}
      </PageBody>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this ad?"
        body={
          pendingDelete
            ? `“${pendingDelete.listing.title}” will be removed permanently.`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}
