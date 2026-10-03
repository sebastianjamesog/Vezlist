"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radio, Pencil, Plus, RefreshCw } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import * as livePlansApi from "../lib/api/livePlans.js";

const EMPTY_PLAN = {
  name: "",
  price: "15",
  currency: "CAD",
  durationMinutes: "10",
  badge: "",
  sortOrder: "0",
  enabled: true,
};
const INPUT = `${FIELD} ${border(false)} focus-visible:ring-2 focus-visible:ring-brand/30`;
const CURRENCIES = ["CAD", "USD", "EUR", "GBP"];

function validate(draft) {
  if (!draft.name.trim() || draft.name.trim().length > 80)
    return "Enter a plan name between 1 and 80 characters.";
  if (
    !/^\d+(\.\d{1,2})?$/.test(String(draft.price)) ||
    Number(draft.price) > 99999999.99
  )
    return "Enter a price from 0 to 99,999,999.99 with at most two decimal places.";
  if (!CURRENCIES.includes(draft.currency))
    return "Choose CAD, USD, EUR, or GBP.";
  if (
    !/^\d+$/.test(String(draft.durationMinutes)) ||
    Number(draft.durationMinutes) < 1 ||
    Number(draft.durationMinutes) > 180
  )
    return "Enter a duration between 1 and 180 minutes.";
  if (!/^\d+$/.test(String(draft.sortOrder)) || Number(draft.sortOrder) > 10000)
    return "Enter a display order from 0 to 10,000.";
  if ((draft.badge?.trim().length ?? 0) > 40)
    return "Keep the badge to 40 characters or fewer.";
  return null;
}

export default function LivePlans() {
  const { ready, can } = useAdminAuth();
  const allowed = can("livePlans.manage");
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const { items } = await livePlansApi.listLivePlans();
      if (current === requestId.current) {
        setPlans(items);
      }
      return items;
    } catch (error) {
      if (current === requestId.current)
        setLoadError(error.message || "Could not load live plans.");
      return null;
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Synchronize the server-backed list after the authenticated role becomes known.
    // eslint-disable-next-line react/set-state-in-effect
    if (ready && allowed) refresh();
    return () => {
      requestId.current += 1;
    };
  }, [ready, allowed, refresh]);

  function edit(plan) {
    setDraft({ ...plan, badge: plan.badge ?? "" });
    setSaveError(null);
    setConflict(false);
    setNotice("");
  }

  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveError(null);
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !allowed || conflict) return;
    const error = validate(draft);
    if (error) {
      setSaveError(error);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: draft.name.trim(),
      price: Number(draft.price),
      currency: draft.currency,
      durationMinutes: Number(draft.durationMinutes),
      badge: draft.badge?.trim() || null,
      enabled: draft.enabled,
      sortOrder: Number(draft.sortOrder),
    };
    try {
      const saved = draft.id
        ? await livePlansApi.updateLivePlan(draft.id, {
            ...payload,
            version: draft.version,
          })
        : await livePlansApi.createLivePlan(payload);
      setPlans((current) => [
        ...(current ?? []).filter((plan) => plan.id !== saved.id),
        saved,
      ]);
      setDraft(null);
      setNotice(
        `${saved.name} saved. ${saved.enabled ? "Ad creators can now select this plan." : "This plan is hidden from new purchases."}`,
      );
    } catch (caught) {
      setConflict(caught.status === 409);
      setSaveError(
        caught.status === 409
          ? "This plan changed while you were editing. Load the latest values before saving again."
          : caught.message ||
              "Could not save this plan. Your changes are still here; please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadLatest() {
    const items = await refresh();
    const latest = items?.find((plan) => plan.id === draft.id);
    if (latest) edit(latest);
  }

  if (!ready)
    return (
      <p role="status" className="text-muted">
        Loading admin access…
      </p>
    );
  if (!allowed)
    return (
      <>
        <AdminHeader title="Live plans" />
        <p role="alert" className={CARD}>
          Only administrators can manage live plans and prices.
        </p>
      </>
    );

  return (
    <>
      <AdminHeader
        title="Live plans"
        subtitle="Manage Personals live prices, session durations, and availability."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || saving}
              onClick={refresh}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={Boolean(draft) || saving}
              onClick={() => edit(EMPTY_PLAN)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add plan
            </Button>
          </>
        }
      />
      <p className="mb-5 rounded-xl bg-brand-soft p-4 text-sm text-ink">
        Prices and durations apply to new sessions. Existing sessions keep their
        selected plan. Demo purchases do not charge money.
      </p>
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-900"
        >
          {notice}
        </p>
      )}
      {loadError && (
        <div
          role="alert"
          className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900"
        >
          {loadError}{" "}
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="font-semibold underline focus-visible:ring-2 focus-visible:ring-brand"
          >
            Try again
          </button>
        </div>
      )}
      <div
        className={`grid grid-cols-1 items-start gap-5 ${draft ? "xl:grid-cols-2" : ""}`}
      >
        {draft && (
          <form
            key={draft.id ?? "new"}
            onSubmit={save}
            className={`${CARD} order-first min-w-0`}
            aria-labelledby="live-plan-form-title"
            noValidate
          >
            <h2
              id="live-plan-form-title"
              className="mb-4 text-lg font-bold text-ink"
            >
              {draft.id ? "Edit live plan" : "New live plan"}
            </h2>
            <fieldset
              disabled={saving || conflict}
              className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <Field label="Plan name">
                  <input
                    autoFocus
                    className={INPUT}
                    maxLength={80}
                    value={draft.name}
                    onChange={(event) => change("name", event.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Price">
                <input
                  className={INPUT}
                  type="number"
                  min="0"
                  max="99999999.99"
                  step="0.01"
                  value={draft.price}
                  onChange={(event) => change("price", event.target.value)}
                  required
                />
              </Field>
              <Field label="Currency">
                <select
                  className={INPUT}
                  value={draft.currency}
                  onChange={(event) => change("currency", event.target.value)}
                  required
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Duration (minutes)">
                <input
                  className={INPUT}
                  type="number"
                  min="1"
                  max="180"
                  step="1"
                  value={draft.durationMinutes}
                  onChange={(event) =>
                    change("durationMinutes", event.target.value)
                  }
                  required
                />
              </Field>
              <Field label="Display order" hint="Lowest first">
                <input
                  className={INPUT}
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  value={draft.sortOrder}
                  onChange={(event) => change("sortOrder", event.target.value)}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Badge" hint="Optional">
                  <input
                    className={INPUT}
                    maxLength={40}
                    value={draft.badge}
                    onChange={(event) => change("badge", event.target.value)}
                    placeholder="Most Popular"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-3 text-sm font-semibold text-ink sm:col-span-2">
                <input
                  type="checkbox"
                  className="size-5 accent-brand focus-visible:ring-2 focus-visible:ring-brand"
                  checked={draft.enabled}
                  onChange={(event) => change("enabled", event.target.checked)}
                />
                Available to ad creators
              </label>
            </fieldset>
            {saveError && (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {saveError}
              </p>
            )}
            {conflict && (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={loading}
                onClick={loadLatest}
              >
                Load latest values
              </Button>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="submit" disabled={saving || conflict}>
                {saving ? "Saving…" : "Save plan"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        <section
          className="min-w-0"
          aria-label="Live plans"
          aria-busy={loading}
        >
          {loading && (
            <p role="status" className="mb-3 text-sm text-muted">
              Loading live plans…
            </p>
          )}
          {plans?.length === 0 && (
            <div className={`${CARD} text-center`}>
              <Radio
                className="mx-auto mb-3 size-8 text-muted"
                aria-hidden="true"
              />
              <h2 className="font-bold text-ink">No live plans yet</h2>
              <p className="mt-1 text-sm text-muted">
                Add a plan to make it available when setting up a live session.
              </p>
            </div>
          )}
          <div
            className={`grid grid-cols-1 gap-3 ${draft ? "" : "md:grid-cols-2"}`}
          >
            {[...(plans ?? [])]
              .sort(
                (a, b) =>
                  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
              )
              .map((plan) => (
                <article key={plan.id} className={CARD}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 break-words text-lg font-bold text-ink">
                      {plan.name}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${plan.enabled ? "bg-green-50 text-green-800" : "bg-canvas text-muted"}`}
                    >
                      {plan.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-ink">
                    {new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: plan.currency,
                    }).format(plan.price)}{" "}
                    <span className="text-xs font-medium text-muted">
                      {plan.currency}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {plan.durationMinutes} minutes
                  </p>
                  {plan.badge && (
                    <p className="mt-2 break-words text-xs font-semibold text-brand">
                      {plan.badge}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-muted">
                      Display order: {plan.sortOrder}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || Boolean(draft)}
                      onClick={() => edit(plan)}
                      aria-label={`Edit ${plan.name}`}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </div>
    </>
  );
}
