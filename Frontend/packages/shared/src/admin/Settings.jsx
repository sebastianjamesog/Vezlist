"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { getAdminSettings, updateAdminSettings } from "../lib/api/adminSettings.js";

const INPUT = `${FIELD} ${border(false)}`;
export default function Settings() {
  const { ready, can } = useAdminAuth();
  const allowed = can("settings.edit");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setDraft(await getAdminSettings()); setConflict(false); }
    catch (caught) { setError(caught.message || "Could not load settings."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);
  const change = (key, value) => { setDraft((current) => ({ ...current, [key]: value })); setNotice(""); };
  async function save(event) {
    event.preventDefault();
    if (!allowed || saving || conflict) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const saved = await updateAdminSettings({ ...draft,
        ageGateTitle: draft.ageGateTitle.trim(), ageGateBody: draft.ageGateBody.trim(),
        reviewSlaHours: Number(draft.reviewSlaHours), reportSlaHours: Number(draft.reportSlaHours),
        ticketSlaHours: Number(draft.ticketSlaHours),
      });
      setDraft(saved); setNotice("Settings saved. Public age-gate copy applies on the next page load.");
    } catch (caught) {
      setConflict(caught.status === 409);
      setError(caught.status === 409 ? "Settings changed while you were editing. Reload the latest settings before saving." : caught.message || "Could not save settings. Your changes are still here.");
    } finally { setSaving(false); }
  }
  return <>
    <AdminHeader title="Settings" subtitle="Public age-gate copy and moderation response targets" actions={<Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>Reload settings</Button>} />
    {error && <p role="alert" className={`${CARD} mb-4 text-danger`}>{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-900">{notice}</p>}
    {!allowed && ready && <p className="mb-4 text-sm text-muted">Only administrators can change these settings.</p>}
    {loading || !ready ? <p role="status">Loading settings...</p> : draft && <form onSubmit={save}>
      <fieldset disabled={!allowed || saving || conflict} className="grid gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="mb-1 text-lg font-bold">Age gate</h2>
          <p className="mb-4 text-sm text-muted">Shown before entering Personals. The age requirement and confirmation remain mandatory.</p>
          <div className="space-y-4">
            <Field label="Heading"><input required maxLength={160} className={INPUT} value={draft.ageGateTitle} onChange={(e) => change("ageGateTitle", e.target.value)} /></Field>
            <Field label="Body"><textarea required maxLength={2000} rows={4} className={INPUT} value={draft.ageGateBody} onChange={(e) => change("ageGateBody", e.target.value)} /></Field>
          </div>
        </section>
        <section className={CARD}>
          <h2 className="mb-1 text-lg font-bold">Response targets</h2>
          <p className="mb-4 text-sm text-muted">Queues mark open items overdue after these hours. These targets do not automatically approve or close items.</p>
          <div className="space-y-4">
            {[ ["reviewSlaHours", "Ad review target", 72], ["reportSlaHours", "Report response target", 168], ["ticketSlaHours", "Ticket response target", 168] ].map(([key, label, max]) => <Field key={key} label={label} hint="Hours"><input required type="number" min={1} max={max} step={1} className={INPUT} value={draft[key]} onChange={(e) => change(key, e.target.value)} /></Field>)}
          </div>
        </section>
      </fieldset>
      {allowed && <Button type="submit" className="mt-4" disabled={saving || conflict}>{saving ? "Saving..." : "Save settings"}</Button>}
    </form>}
    <section className={`${CARD} mt-5`}>
      <h2 className="font-bold">Live and story availability</h2>
      <p className="mt-2 text-sm text-muted">Manage purchasable options in Live plans and Story packs. Provider connections and payment availability are configured on the server. Discreet mode is each member's preference.</p>
    </section>
  </>;
}
