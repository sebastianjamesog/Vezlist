"use client";

import { useState } from "react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import StatusBadge from "../components/admin/StatusBadge";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { tones } from "../lib/tones";
import { useSiteScope } from "../lib/adminScope";
import { compactCount, timeAgo } from "../lib/format";

/**
 * Compose a push broadcast, and the record of the ones already sent.
 *
 * A send is confirmed rather than fired on the button, because it is the one
 * action in the console that reaches outside it and cannot be taken back.
 */

const TARGETS = [
  { value: "all", label: "Both sites" },
  { value: "marketplace", label: "Marketplace" },
  { value: "personals", label: "Personals" },
];

const TONE_CHOICES = ["blue", "green", "amber", "rose", "purple", "indigo"];

const EMPTY = {
  title: "",
  body: "",
  tone: "blue",
  icon: "Megaphone",
  site: "all",
};

export default function Notifications() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const [draft, setDraft] = useState(EMPTY);
  const [confirming, setConfirming] = useState(false);
  const [site] = useSiteScope();

  // A broadcast sent to both sites belongs in either scope's history.
  const sent = state.broadcasts.filter(
    (b) => site === "all" || b.site === "all" || b.site === site,
  );

  const ready = draft.title.trim() && draft.body.trim();

  return (
    <>
      <AdminHeader
        title="Notifications"
        subtitle="Push broadcasts to one site or both"
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <section className={`${CARD} lg:col-span-3`}>
          <h2 className="mb-3 text-[17px] font-extrabold text-ink">Compose</h2>

          <div className="flex flex-col gap-4">
            <Field label="Title" hint={`${draft.title.length}/60`}>
              <input
                value={draft.title}
                maxLength={60}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Scheduled maintenance Sunday"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>

            <Field label="Body" hint={`${draft.body.length}/140`}>
              <textarea
                value={draft.body}
                maxLength={140}
                rows={3}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Posting is paused 02:00–04:00 PT while we move the search index."
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>

            <Field label="Send to">
              <div className="flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
                {TARGETS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={draft.site === t.value}
                    onClick={() => setDraft({ ...draft, site: t.value })}
                    className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                      draft.site === t.value
                        ? "bg-surface text-ink shadow-card"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Icon" hint="From the registry">
                <input
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                  placeholder="Megaphone"
                  className={`${FIELD} ${border(false)}`}
                />
              </Field>
              <Field label="Tone">
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {TONE_CHOICES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      aria-label={tone}
                      aria-pressed={draft.tone === tone}
                      onClick={() => setDraft({ ...draft, tone })}
                      className={`size-8 rounded-lg ${tones[tone]} ${
                        draft.tone === tone
                          ? "ring-2 ring-ink ring-offset-2"
                          : ""
                      }`}
                    >
                      <span className="sr-only">{tone}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-[14px] font-bold text-ink">Preview</p>
              <div className="flex items-start gap-3 rounded-card bg-canvas p-3.5">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[draft.tone] ?? tones.blue}`}
                >
                  <Icon
                    name={draft.icon}
                    className="size-5"
                    strokeWidth={2.4}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-bold text-ink">
                    {draft.title || "Your title here"}
                  </p>
                  <p className="text-[13px] leading-snug text-muted">
                    {draft.body || "And the line underneath it."}
                  </p>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              disabled={!ready}
              onClick={() => setConfirming(true)}
            >
              Send broadcast
            </Button>
          </div>
        </section>

        <section className={`${CARD} lg:col-span-2`}>
          <h2 className="mb-3 text-[17px] font-extrabold text-ink">
            Sent
            <span className="ml-2 text-[13px] font-semibold text-muted">
              {sent.length}
            </span>
          </h2>
          <ul className="divide-y divide-line">
            {sent.map((b) => (
              <li key={b.id} className="flex items-start gap-3 py-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${tones[b.tone] ?? tones.blue}`}
                >
                  <Icon
                    name={b.icon}
                    className="size-[18px]"
                    strokeWidth={2.4}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-ink">
                    {b.title}
                  </p>
                  <p className="line-clamp-2 text-[12.5px] leading-snug text-muted">
                    {b.body}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {b.sentMsAgo ? timeAgo(b.sentMsAgo) : "Just now"} ·{" "}
                    {compactCount(b.reach)} devices
                  </p>
                </div>
                <StatusBadge
                  status={b.site === "all" ? "sent" : b.site}
                  label={b.site === "all" ? "Both" : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Send this broadcast?"
        body={`"${draft.title}" goes to every device on ${draft.site === "all" ? "both sites" : draft.site}. A push cannot be recalled.`}
        confirmLabel="Send"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          dispatch({ type: "sendBroadcast", broadcast: draft });
          toast("Broadcast sent");
          setDraft(EMPTY);
          setConfirming(false);
        }}
      />
    </>
  );
}
