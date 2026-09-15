"use client";

import { useState } from "react";
import { BadgeCheck, Users } from "lucide-react";
import AdminHeader from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import { RevealButton, useReveal } from "../components/admin/RevealMedia";
import MediaImage from "../components/media/MediaImage.jsx";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { inScope, useSiteScope } from "../lib/adminScope";
import { compactCount, timeAgo } from "../lib/format";

/**
 * Broadcasts, as covers rather than as rows.
 *
 * This is the one screen where a table would be wrong: the media *is* the
 * moderation signal, and a table of hostnames and durations tells a moderator
 * nothing about whether to pull a stream. So it is a grid, and every tile
 * shows the frame the decision is actually about.
 */
export default function Live() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { revealed, toggle } = useReveal();
  const [ending, setEnding] = useState(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState("live");
  // Broadcasting only exists on personals, so scoping to the marketplace
  // empties this screen — which is the honest answer, not a bug.
  const [site] = useSiteScope();

  const inSite = state.streams.filter((s) => inScope(s, site));
  const rows = inSite.filter((s) => (tab === "all" ? true : s.status === tab));
  const liveNow = inSite.filter((s) => s.status === "live").length;

  return (
    <>
      <AdminHeader
        title="Live"
        subtitle={`${liveNow} broadcast${liveNow === 1 ? "" : "s"} running right now`}
        actions={<RevealButton revealed={revealed} onClick={toggle} />}
      />

      <div
        role="group"
        aria-label="Stream status"
        className="mb-4 flex w-fit gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line"
      >
        {[
          { value: "live", label: "Live now" },
          { value: "ended", label: "Ended" },
          { value: "all", label: "All" },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              tab === t.value
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((stream) => (
            <article
              key={stream.id}
              className="flex flex-col overflow-hidden rounded-card bg-surface shadow-card"
            >
              {/* `revealed` is this screen's Reveal button, not discreet
                  mode — the console has no `[data-discreet]` toggle of its
                  own. Withheld, MediaImage renders a plain placeholder here
                  instead of the cover, so the badges below stay sharp
                  either way without needing their own carve-out. */}
              <div className="relative aspect-[3/4] overflow-hidden bg-canvas">
                <MediaImage
                  revealed={revealed}
                  fill
                  src={stream.cover}
                  alt=""
                  sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                  className="object-cover"
                />
              </div>

              <div className="relative -mt-9 flex items-center gap-2 px-3">
                <StatusBadge
                  status={stream.status}
                  dot={stream.status === "live"}
                />
                {stream.status === "live" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold text-white">
                    <Users
                      className="size-3.5"
                      strokeWidth={2.6}
                      aria-hidden="true"
                    />
                    {compactCount(stream.viewers)}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-3 pt-3.5">
                <p className="flex items-center gap-1 text-[14px] font-bold leading-tight text-ink">
                  <span className="truncate">{stream.host}</span>
                  {stream.verified && (
                    <BadgeCheck
                      className="size-4 shrink-0 text-brand"
                      strokeWidth={2.6}
                      aria-label="Verified host"
                    />
                  )}
                </p>
                <p className="line-clamp-2 text-[13px] leading-snug text-muted">
                  {stream.title}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {stream.location} · started {timeAgo(stream.startedMsAgo)}
                </p>

                <div className="mt-auto flex gap-2 pt-3">
                  {!stream.verified && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        dispatch({ type: "verifyHost", id: stream.id });
                        toast(`${stream.host} verified`);
                      }}
                    >
                      Verify
                    </Button>
                  )}
                  {stream.status === "live" && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      onClick={() => setEnding(stream)}
                    >
                      End
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="Radio"
          title="Nothing broadcasting"
          body={
            site === "marketplace"
              ? "Live is a personals feature. Switch the site scope to see broadcasts."
              : "No streams in this state right now."
          }
        />
      )}

      <Modal
        open={Boolean(ending)}
        title={`End ${ending?.host}'s broadcast?`}
        subtitle="Viewers are dropped immediately and the host is told why."
        size="max-w-md"
        onClose={() => setEnding(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setEnding(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              disabled={!reason.trim()}
              onClick={() => {
                dispatch({ type: "endStream", id: ending.id, reason });
                toast("Broadcast ended");
                setEnding(null);
                setReason("");
              }}
            >
              End broadcast
            </Button>
          </div>
        }
      >
        <Field label="Reason" hint="Required">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Nudity on stream."
            className={`${FIELD} ${border(false)} resize-none`}
          />
        </Field>
      </Modal>
    </>
  );
}
