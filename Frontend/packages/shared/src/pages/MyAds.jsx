"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Heart, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import OwnerModeration from "../components/moderation/OwnerModeration";
import { useShell } from "../components/layout/AppLayout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import {
  LISTING_STATUS_OPTIONS,
  listingStatus,
  relativeListingTime,
} from "../lib/listings";
import { useNavigate } from "../lib/nav";
import { SITE } from "../lib/sites";

export default function MyAds() {
  const toast = useToast();
  const navigate = useNavigate();
  const { editPost } = useShell();
  const { ready, signedIn, user } = useAuth();
  const [tab, setTab] = useState("ALL");
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setAds(await api("/me/listings?site=" + SITE.toUpperCase()));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      navigate("/login");
      return;
    }
    load();
  }, [ready, signedIn, load, navigate, reload]);

  useEffect(() => {
    const refresh = () => setReload((value) => value + 1);
    window.addEventListener("vezlist:listings-changed", refresh);
    return () =>
      window.removeEventListener("vezlist:listings-changed", refresh);
  }, []);

  const rows = useMemo(
    () => (tab === "ALL" ? ads : ads.filter((ad) => ad.status === tab)),
    [ads, tab],
  );

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await api("/listings/" + pendingDelete.id, { method: "DELETE" });
      setAds((current) =>
        current.filter((listing) => listing.id !== pendingDelete.id),
      );
      setPendingDelete(null);
      toast("Ad deleted");
    } catch (requestError) {
      toast(requestError.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SubPageBar
        title="My Ads"
        subtitle={ads.length + " listing" + (ads.length === 1 ? "" : "s")}
        fallback="/profile"
      />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="no-scrollbar mb-4 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
            {[{ value: "ALL", label: "All" }, ...LISTING_STATUS_OPTIONS].map(
              (status) => {
                const count =
                  status.value === "ALL"
                    ? ads.length
                    : ads.filter((ad) => ad.status === status.value).length;
                return (
                  <button
                    key={status.value}
                    onClick={() => setTab(status.value)}
                    aria-pressed={tab === status.value}
                    className={
                      "rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors " +
                      (tab === status.value
                        ? "bg-surface text-ink shadow-card"
                        : "text-muted hover:text-ink")
                    }
                  >
                    {status.label} ({count})
                  </button>
                );
              },
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-card bg-surface px-6 py-16 text-center text-[14px] text-muted shadow-card">
            Loading your ads...
          </div>
        ) : error ? (
          <EmptyState
            icon="SearchX"
            title="Could not load your ads"
            body={error}
            action={
              <Button
                variant="soft"
                onClick={() => setReload((value) => value + 1)}
              >
                Try again
              </Button>
            }
          />
        ) : rows.length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((listing) => {
              const status = listingStatus(listing.status);
              const cover = listing.media?.find(
                (image) => image.status === "READY" && image.url,
              )?.url;
              const editable = ["DRAFT", "REJECTED"].includes(listing.status);
              return (
                <article
                  key={listing.id}
                  className="rounded-card bg-surface p-3 shadow-card lg:p-4"
                >
                  <div className="flex gap-3">
                    <Link href={"/ad/" + listing.id} className="shrink-0">
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          loading="lazy"
                          className="size-[72px] rounded-xl object-cover"
                        />
                      ) : (
                        <span className="grid size-[72px] place-items-center rounded-xl bg-brand-soft text-brand">
                          <ImageIcon className="size-6" />
                        </span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={"/ad/" + listing.id}
                          className="text-[16px] font-bold leading-tight text-ink hover:text-brand"
                        >
                          {listing.title}
                        </Link>
                        <span
                          className={
                            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                            status.tone
                          }
                        >
                          {status.label}
                        </span>
                      </div>

                      <p className="mt-1 text-[12px] text-muted">
                        {relativeListingTime(
                          listing.updatedAt ?? listing.createdAt,
                        )}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-[13px] text-muted">
                        <span className="flex items-center gap-1">
                          <Eye className="size-4" />
                          {listing.viewCount ?? 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="size-4" />
                          {listing.saveCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {signedIn && ["PENDING_REVIEW", "REJECTED", "REMOVED"].includes(listing.status) && (
                    <OwnerModeration key={`${user?.id}:${listing.id}:${listing.status}:${listing.updatedAt}`} listingId={listing.id} />
                  )}
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    {editable && (
                      <button
                        onClick={() => editPost(listing)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas"
                      >
                        <Pencil className="size-4" />
                        Edit and submit
                      </button>
                    )}
                    <Link
                      href={"/ad/" + listing.id}
                      className="flex flex-1 items-center justify-center rounded-xl bg-brand-soft py-2.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => setPendingDelete(listing)}
                      aria-label={"Delete " + listing.title}
                      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-red-500 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="Megaphone"
            title={
              tab === "ALL"
                ? "No ads yet"
                : "No " + listingStatus(tab).label.toLowerCase() + " ads"
            }
            body="Create an ad and it will appear here for you to manage."
          />
        )}
      </PageBody>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={deleting ? "Deleting ad..." : "Delete this ad?"}
        body={
          pendingDelete
            ? '"' + pendingDelete.title + '" will be removed from Vezlist.'
            : ""
        }
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        destructive
        onConfirm={confirmDelete}
        onClose={() => !deleting && setPendingDelete(null)}
      />
    </>
  );
}
