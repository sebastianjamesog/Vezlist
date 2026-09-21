"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import { RevealButton, useReveal } from "../components/admin/RevealMedia";
import MediaImage from "../components/media/MediaImage.jsx";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { inScope, useSiteScope } from "../lib/adminScope";
import { statusTime } from "../lib/status";

/**
 * Status updates, grouped by who posted them.
 *
 * A media grid for the same reason `Live` is one: a filename tells a moderator
 * nothing, and these expire on their own inside a day — so the screen is built
 * to be scanned fast and acted on in one click, not sorted and paged.
 */
export default function Status() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { revealed, toggle } = useReveal();
  const [removingStory, setRemovingStory] = useState(null);
  // Status updates are a personals feature; scoping to the marketplace empties
  // this screen, which is the honest answer rather than a bug.
  const [site] = useSiteScope();

  const stories = state.stories.filter(
    (s) => inScope(s, site) && s.updates.length > 0,
  );
  const total = stories.reduce((n, s) => n + s.updates.length, 0);

  return (
    <>
      <AdminHeader
        title="Status"
        subtitle={`${total} update${total === 1 ? "" : "s"} across ${stories.length} ${stories.length === 1 ? "person" : "people"}`}
        actions={<RevealButton revealed={revealed} onClick={toggle} />}
      />

      {stories.length ? (
        <div className="flex flex-col gap-4">
          {stories.map((story) => (
            <section key={story.id} className={CARD}>
              <header className="mb-3 flex items-center gap-3">
                <MediaImage
                  src={story.avatar}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">
                    {story.name}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {story.updates.length} update
                    {story.updates.length === 1 ? "" : "s"} ·{" "}
                    {statusTime(story.msAgo)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setRemovingStory(story)}
                >
                  Remove all
                </Button>
              </header>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {story.updates.map((update) => (
                  <figure key={update.id} className="group relative">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-canvas">
                      <MediaImage
                        revealed={revealed}
                        fill
                        src={update.image}
                        alt=""
                        sizes="(min-width: 1280px) 12.5vw, (min-width: 640px) 25vw, 33vw"
                        className="object-cover"
                      />
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove update from ${story.name}`}
                      onClick={() => {
                        dispatch({
                          type: "removeUpdate",
                          storyId: story.id,
                          id: update.id,
                        });
                        toast("Update removed");
                      }}
                      // Always reachable by keyboard; revealed on hover for
                      // the pointer, so the grid stays readable at a glance.
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" strokeWidth={2.4} />
                    </button>

                    {update.caption && (
                      <figcaption className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-muted">
                        {update.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="Clapperboard"
          title="No status updates"
          body={
            site === "marketplace"
              ? "Status is a personals feature. Switch the site scope to see updates."
              : "Everything posted has been removed or has expired."
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(removingStory)}
        title={`Remove every update from ${removingStory?.name}?`}
        body="All of their updates come down at once. This cannot be undone from the console."
        confirmLabel="Remove all"
        destructive
        onClose={() => setRemovingStory(null)}
        onConfirm={() => {
          dispatch({ type: "removeStory", id: removingStory.id });
          toast(`${removingStory.name}'s updates removed`);
          setRemovingStory(null);
        }}
      />
    </>
  );
}
