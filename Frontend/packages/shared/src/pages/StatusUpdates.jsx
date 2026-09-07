"use client";

import { RotateCcw } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import EmptyState from "../components/ui/EmptyState";
import { MyStatusRow, StatusSection } from "../components/StatusList";
import { useStatus } from "../context/StatusContext";
import { useToast } from "../context/ToastContext";
import { groupStatuses } from "../lib/status";
import { stories } from "../data/mock";

export default function StatusUpdates() {
  const { seen, clearSeen } = useStatus();
  const toast = useToast();
  const { mine, recent, viewed } = groupStatuses(stories, seen);

  return (
    <>
      <SubPageBar
        title="Status"
        subtitle={`${recent.length} new update${recent.length === 1 ? "" : "s"}`}
        fallback="/"
        action={
          viewed.length ? (
            <button
              onClick={clearSeen}
              className="shrink-0 rounded-full bg-surface px-3.5 py-2 text-[13px] font-bold text-brand shadow-card transition-colors hover:bg-brand-soft"
            >
              Mark unseen
            </button>
          ) : null
        }
      />

      <PageBody className="px-4 pb-8 pt-3 lg:max-w-2xl lg:px-8 lg:py-6">
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <MyStatusRow
            story={mine}
            onAdd={() => toast("Posting a status is not wired up yet")}
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-card bg-surface shadow-card">
          <StatusSection title="Recent updates" stories={recent} seen={false} />
          <StatusSection
            title="Viewed updates"
            stories={viewed}
            seen
            action={
              <RotateCcw
                className="size-4 shrink-0 text-muted"
                strokeWidth={2.2}
              />
            }
          />
        </div>

        {!recent.length && !viewed.length && (
          <div className="mt-4">
            <EmptyState
              icon="Circle"
              title="No updates yet"
              body="Status updates from people you follow show up here for 24 hours."
            />
          </div>
        )}

        <p className="mt-5 text-center text-[12px] text-muted">
          Status updates disappear after 24 hours.
        </p>
      </PageBody>
    </>
  );
}
