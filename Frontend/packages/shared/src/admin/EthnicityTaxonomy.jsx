"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import * as catalogApi from "../lib/api/adminCatalog.js";

export default function EthnicityTaxonomy() {
  const { can } = useAdminAuth();
  const canEdit = can("taxonomy.edit");
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [removing, setRemoving] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const version = ++generation.current;
    setError(null);
    try {
      const result = await catalogApi.listEthnicities();
      if (generation.current === version) setRows(result);
    } catch (caught) {
      if (generation.current === version) setError(caught);
    }
  }, []);
  useEffect(() => {
    load();
    return () => { generation.current++; };
  }, [load]);

  async function save(event) {
    event.preventDefault();
    if (!canEdit || submitting.current || !label.trim()) return;
    submitting.current = true;
    setPending(true);
    setActionError(null);
    const version = generation.current;
    try {
      const created = await catalogApi.createEthnicity(label.trim());
      if (version !== generation.current) return;
      setRows((current) => [...(current ?? []).filter((row) => row.id !== created.id), created]);
      setAdding(false);
      setLabel("");
      toast("Ethnicity added");
    } catch (caught) {
      if (version === generation.current) setActionError(caught.message || "Couldn't add this ethnicity.");
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
      await catalogApi.deleteEthnicity(removing.id);
      if (version !== generation.current) return;
      setRows((current) => current.filter((row) => row.id !== removing.id));
      setRemoving(null);
      toast("Ethnicity removed");
    } catch (caught) {
      if (version === generation.current) setActionError(caught.message || "Couldn't remove this ethnicity.");
    } finally {
      submitting.current = false;
      if (version === generation.current) setPending(false);
    }
  }

  return (
    <>
      <section className={CARD}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-extrabold text-ink">Ethnicities</h2>
            <p className="mt-1 text-[13px] text-muted">Options for Personals ads. Removing an option keeps the information on existing ads.</p>
          </div>
          {canEdit && <Button size="sm" onClick={() => { setAdding(true); setLabel(""); setActionError(null); }}>Add ethnicity</Button>}
        </div>
        {error ? <EmptyState icon="ShieldAlert" title="Couldn't load ethnicities" body={error.message} action={<Button onClick={load}>Try again</Button>} />
          : rows === null ? <p role="status" className="text-sm text-muted">Loading ethnicities…</p>
          : rows.length === 0 ? <p className="text-sm text-muted">No ethnicity options yet.</p>
          : <ul className="divide-y divide-line">
            {rows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0 break-words text-[14.5px] font-semibold text-ink">{row.label}</span>
              {canEdit && <button type="button" aria-label={`Delete ${row.label}`} className="grid size-9 shrink-0 place-items-center rounded-xl text-danger hover:bg-danger-soft" disabled={pending}
                onClick={() => { setRemoving(row); setActionError(null); }}><Trash2 className="size-4" /></button>}
            </li>)}
          </ul>}
      </section>

      <Modal open={adding} title="Add ethnicity" size="max-w-md" onClose={() => !pending && setAdding(false)} footer={
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setAdding(false)}>Cancel</Button>
          <Button type="submit" form="add-ethnicity" className="flex-1" disabled={pending || !label.trim()}>{pending ? "Adding…" : "Add"}</Button>
        </div>
      }>
        <form id="add-ethnicity" onSubmit={save}>
          {actionError && <p role="alert" className="mb-3 text-sm text-danger">{actionError}</p>}
          <Field label="Ethnicity name" hint="Up to 80 characters">
            <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className={`${FIELD} ${border(false)}`} />
          </Field>
        </form>
      </Modal>

      <Modal open={Boolean(removing)} title="Remove ethnicity" subtitle={`Remove ${removing?.label ?? "this option"} from the available choices? Existing ads keep their saved ethnicity.`} size="max-w-md" onClose={() => !pending && setRemoving(null)} footer={
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" disabled={pending} onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="danger" className="flex-1" disabled={pending} onClick={remove}>{pending ? "Removing…" : "Remove"}</Button>
        </div>
      }>
        {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
      </Modal>
    </>
  );
}
