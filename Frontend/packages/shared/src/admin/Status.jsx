"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import { RevealButton, useReveal } from "../components/admin/RevealMedia";
import MediaImage from "../components/media/MediaImage.jsx";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useSiteScope } from "../lib/adminScope";
import * as storiesApi from "../lib/api/adminStories.js";

export default function Status() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const { revealed, toggle } = useReveal();
  const [site] = useSiteScope();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const load = useCallback(async (cursor) => {
    const version = ++request.current;
    setLoading(true); setError(null);
    if (!cursor) { setPage(null); setRemoving(null); }
    if (site === "marketplace") { setPage({items: []}); setLoading(false); return; }
    try {
      const next = await storiesApi.listAdminStories({ limit: 50, cursor });
      if (request.current === version) setPage(previous => ({ ...next, items: cursor ? [...(previous?.items ?? []), ...next.items] : next.items }));
    } catch (err) {
      if (request.current === version) setError(err.message || "Could not load status updates. Please try again.");
    } finally { if (request.current === version) setLoading(false); }
  }, [site]);
  useEffect(() => { load(); return () => { request.current++; }; }, [load]);
  const groups = new Map();
  for (const story of page?.items ?? []) {
    if (!groups.has(story.ownerId)) groups.set(story.ownerId, { ...story, updates: [] });
    groups.get(story.ownerId).updates.push(story);
  }
  async function remove() {
    if (busy || !removing) return;
    request.current++;
    setLoading(false); setBusy(true); setError(null);
    try {
      if (removing.all) await storiesApi.removeCreatorStories(removing.ownerId);
      else await storiesApi.removeAdminStory(removing.id);
      setPage(previous => previous && ({...previous, items: previous.items.filter(item => removing.all ? item.ownerId !== removing.ownerId : item.id !== removing.id)}));
      setRemoving(null); toast("Status update" + (removing.all ? "s removed" : " removed"));
    } catch (err) { setError(err.message || "Could not remove this update. Please try again."); }
    finally { setBusy(false); }
  }
  return <>
    <AdminHeader title="Status" subtitle={`${page?.items.length ?? 0}${page?.hasMore ? "+" : ""} published updates loaded`}
      actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={loading || busy} onClick={() => load()}>Refresh</Button><RevealButton revealed={revealed} onClick={toggle} /></div>} />
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}{!removing && <Button size="sm" onClick={() => load(page?.nextCursor)}>Try again</Button>}</div>}
    {loading && !page && <p role="status">Loading status updates...</p>}
    {page && !page.items.length && <EmptyState icon="Clapperboard" title="No status updates" body={site === "marketplace" ? "Status is a personals feature. Switch the site scope to see updates." : "No published, unexpired updates are available."} />}
    <div className="flex flex-col gap-4">{[...groups.values()].map(creator => <section key={creator.ownerId} className={CARD}>
      <header className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-bold text-ink">{creator.creatorName}</p><p className="text-[12px] text-muted">{creator.updates.length} updates loaded</p></div>
        {can("status.moderate") && <Button size="sm" variant="danger" onClick={() => setRemoving({...creator, all:true})}>Remove all</Button>}
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{creator.updates.map(story => <figure key={story.id} className="relative">
        <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-canvas">
          {story.mediaType === "VIDEO" ? (revealed ? <video controls preload="metadata" src={story.mediaUrl} className="h-full w-full object-contain" aria-label={`Status video from ${creator.creatorName}`} /> : <div className="grid h-full place-items-center text-sm text-muted">Video hidden</div>) : <MediaImage revealed={revealed} fill src={story.mediaUrl} alt={`Status from ${creator.creatorName}`} sizes="(min-width:1024px) 17vw, (min-width:640px) 25vw, 50vw" className="object-cover" />}
        </div>
        {can("status.moderate") && <button type="button" aria-label={`Remove update from ${creator.creatorName}`} onClick={() => setRemoving(story)} className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-lg bg-black/70 text-white"><Trash2 className="size-4" /></button>}
      </figure>)}</div>
    </section>)}</div>
    {page?.hasMore && <Button className="mt-4" disabled={loading || busy} onClick={() => load(page.nextCursor)}>{loading ? "Loading..." : "Load more"}</Button>}
    <Modal open={Boolean(removing)} title={removing?.all ? `Remove all updates from ${removing.creatorName}?` : "Remove this status update?"} subtitle="The published updates will be removed from the public story feed." onClose={() => !busy && setRemoving(null)} size="max-w-md"
      footer={<div className="flex gap-3"><Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={remove}>{busy ? "Removing..." : "Remove"}</Button></div>}>
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </Modal>
  </>;
}
