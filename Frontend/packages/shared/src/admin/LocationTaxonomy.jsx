"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import * as catalog from "../lib/api/adminCatalog.js";

const LEVELS = [
  { type: "PROVINCE", title: "Province", plural: "provinces" },
  { type: "AREA", title: "Region / city", plural: "regions / cities" },
  { type: "NEIGHBOURHOOD", title: "Neighbourhood", plural: "neighbourhoods" },
];

export default function LocationTaxonomy() {
  const { can } = useAdminAuth();
  const canEdit = can("taxonomy.edit");
  const toast = useToast();
  const [locations, setLocations] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(["on", "", ""]);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const version = ++generation.current;
    setError(null);
    try {
      const result = await catalog.listLocations();
      if (version === generation.current) setLocations(result);
    } catch (caught) {
      if (version === generation.current) setError(caught);
    }
  }, []);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);

  const options = [];
  const current = [];
  for (let index = 0; index < LEVELS.length; index++) {
    options[index] = (locations ?? []).filter((row) => row.type === LEVELS[index].type &&
      (index === 0 || (current[index - 1] && row.parentId === current[index - 1].id)))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
    current[index] = options[index].find((row) => row.id === selected[index]) ?? options[index][0];
  }

  function select(index, id) {
    setSelected(current.map((row, position) => position < index ? row?.id ?? "" : position === index ? id : ""));
  }
  function openAdd(index) {
    setActionError(null);
    setEditing({ index, label: "", parentId: current[index - 1]?.id,
      displayOrder: options[index].reduce((max, row) => Math.max(max, row.displayOrder), -1) + 1,
      popular: false, enabled: true });
  }

  async function save(event) {
    event.preventDefault();
    if (!canEdit || submitting.current || !editing?.label.trim()) return;
    submitting.current = true;
    setPending(true);
    setActionError(null);
    const version = generation.current;
    const { index, id, parentId, label, displayOrder, popular, enabled } = editing;
    try {
      const request = { label: label.trim(), displayOrder, popular };
      const saved = id ? await catalog.updateLocation(id, { ...request, enabled })
        : index === 0 ? await catalog.createProvince(request)
        : index === 1 ? await catalog.createArea({ ...request, provinceId: parentId })
        : await catalog.createNeighbourhood({ ...request, areaId: parentId });
      if (version !== generation.current) return;
      setLocations((rows) => [...(rows ?? []).filter((row) => row.id !== saved.id), saved]);
      select(index, saved.id);
      setEditing(null);
      toast(id ? "Location updated" : "Location added");
    } catch (caught) {
      if (version === generation.current) setActionError(caught.message || "Couldn't save this location.");
    } finally {
      submitting.current = false;
      if (version === generation.current) setPending(false);
    }
  }

  async function remove() {
    if (!canEdit || submitting.current || !removing) return;
    submitting.current = true;
    setPending(true);
    setActionError(null);
    const version = generation.current;
    try {
      await catalog.deleteArea(removing.id);
      if (version !== generation.current) return;
      setLocations((rows) => rows.filter((row) => row.id !== removing.id));
      setRemoving(null);
      toast("Location removed");
    } catch (caught) {
      if (version === generation.current) setActionError(caught.message || "Couldn't remove this location.");
    } finally {
      submitting.current = false;
      if (version === generation.current) setPending(false);
    }
  }

  if (error) return <EmptyState icon="ShieldAlert" title="Couldn't load areas" body={error.message} action={<Button onClick={load}>Try again</Button>} />;
  if (locations === null) return <p role="status" className="text-sm text-muted">Loading locations…</p>;

  return <>
    <section className={CARD}>
      <h2 className="text-[17px] font-extrabold text-ink">Location coverage</h2>
      <p className="mb-5 mt-1 text-[13px] text-muted">Province → Region / city → Neighbourhood. These locations are shared by Marketplace and Personals.</p>
      <div className="grid gap-5 lg:grid-cols-3">
        {LEVELS.map((level, index) => <div key={level.type} className="min-w-0 space-y-3">
          <Field label={level.title}>
            <select value={current[index]?.id ?? ""} onChange={(event) => select(index, event.target.value)} className={`${FIELD} ${border(false)}`}>
              {!options[index].length && <option value="">No {level.plural} yet</option>}
              {options[index].map((row) => <option key={row.id} value={row.id}>{row.label}{row.enabled ? "" : " (disabled)"}</option>)}
            </select>
          </Field>
          {canEdit && <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" disabled={pending || (index > 0 && (!current[index - 1]?.enabled || current.slice(0, index).some((row) => !row?.enabled)))} onClick={() => openAdd(index)}>
              Add {level.title.toLowerCase()}
            </Button>
            {current[index] && <>
              <button type="button" aria-label={`Edit ${current[index].label}`} disabled={pending} className="grid size-9 place-items-center rounded-xl border border-line text-muted hover:bg-canvas" onClick={() => { setEditing({ ...current[index], index }); setActionError(null); }}><Pencil className="size-4" /></button>
              <button type="button" aria-label={`Delete ${current[index].label}`} disabled={pending} className="grid size-9 place-items-center rounded-xl border border-line text-danger hover:bg-danger-soft" onClick={() => { setRemoving(current[index]); setActionError(null); }}><Trash2 className="size-4" /></button>
            </>}
          </div>}
          {index > 0 && !current[index - 1] && <p className="text-[13px] text-muted">Add a {LEVELS[index - 1].title.toLowerCase()} first.</p>}
        </div>)}
      </div>
      <p className="mt-5 border-t border-line pt-4 text-[13px] text-muted">Existing ads can keep their region / city. A neighbourhood gives new ads a more precise location.</p>
    </section>

    <Modal open={Boolean(editing)} title={editing?.id ? "Edit location" : `Add ${LEVELS[editing?.index ?? 0].title.toLowerCase()}`} size="max-w-md" onClose={() => !pending && setEditing(null)} footer={<div className="flex gap-3">
      <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setEditing(null)}>Cancel</Button>
      <Button type="submit" form="save-location" className="flex-1" disabled={pending || !editing?.label.trim()}>{pending ? "Saving…" : "Save"}</Button>
    </div>}>
      {editing && <form id="save-location" onSubmit={save} className="space-y-4">
        {editing.parentId && <p className="text-sm text-muted">Under {locations.find((row) => row.id === editing.parentId)?.label}</p>}
        {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
        <Field label="Location name"><input autoFocus value={editing.label} maxLength={120} onChange={(event) => setEditing({ ...editing, label: event.target.value })} className={`${FIELD} ${border(false)}`} /></Field>
        {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={(event) => setEditing({ ...editing, enabled: event.target.checked })} />Enabled</label>}
      </form>}
    </Modal>

    <Modal open={Boolean(removing)} title={`Delete ${removing?.label ?? "location"}?`} subtitle="Locations with child locations or existing ads cannot be deleted. You can disable a location instead." size="max-w-md" onClose={() => !pending && setRemoving(null)} footer={<div className="flex gap-3">
      <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setRemoving(null)}>Cancel</Button>
      <Button variant="danger" className="flex-1" disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Delete"}</Button>
    </div>}>
      {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
    </Modal>
  </>;
}
