"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import SegmentedControl from "../components/ui/SegmentedControl";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { useQueryParam, useSiteScope } from "../lib/adminScope";
import { ApiError } from "../lib/api/client.js";
import * as catalogApi from "../lib/api/adminCatalog.js";

/**
 * Categories and areas, over `AdminCatalogController` (categories + locations
 * CRUD; delete answers 409 `CATALOG_ENTRY_IN_USE` when active listings still
 * reference the entry, shown inline rather than crashing).
 *
 * The old mock also had a nine-tile "home launcher" and personals-only word
 * lists (post categories, ethnicities) with per-category sub-categories —
 * none of that exists on the server (`Category` carries no sub-category
 * list, and there is no launcher-config or vocabulary endpoint at all), so
 * those sections are gone rather than left as dead local-only state. What is
 * real is a flat, site-scoped category list and a shared area list under each
 * province — that's what this screen wires up.
 */

const TABS = [
  { value: "categories", label: "Categories" },
  { value: "areas", label: "Areas" },
];

const SITE_TO_SCOPE = { marketplace: "MARKETPLACE", personals: "PERSONALS" };
const EMPTY_CATEGORY = { label: "", icon: "Tag", primary: false, displayOrder: 0 };

export default function Taxonomy() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const canEdit = can("taxonomy.edit");
  const [tab, setTab] = useQueryParam("tab", "categories");
  const [site] = useSiteScope();
  const siteScope = SITE_TO_SCOPE[site]; // undefined when "all"

  /* ---------------------------------------------------------- categories */
  const [categories, setCategories] = useState(null);
  const [catError, setCatError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    setCatError(null);
    setCategories(null);
    try {
      setCategories(await catalogApi.listCategories(siteScope));
    } catch (err) {
      setCatError(err);
    }
  }, [siteScope]);

  useEffect(() => {
    if (tab === "categories") loadCategories();
  }, [tab, loadCategories]);

  function openAdd() {
    setEditing({ ...EMPTY_CATEGORY, site: siteScope ?? "MARKETPLACE" });
  }

  async function saveCategory() {
    if (!editing.label.trim() || !editing.icon.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        const updated = await catalogApi.updateCategory(editing.id, {
          label: editing.label.trim(),
          icon: editing.icon.trim(),
          primary: editing.primary,
          displayOrder: Number(editing.displayOrder) || 0,
          enabled: editing.enabled ?? true,
        });
        setCategories((rows) => rows.map((c) => (c.id === updated.id ? updated : c)));
        toast("Category updated");
      } else {
        const created = await catalogApi.createCategory({
          label: editing.label.trim(),
          icon: editing.icon.trim(),
          site: editing.site,
          primary: editing.primary,
          displayOrder: Number(editing.displayOrder) || 0,
        });
        setCategories((rows) => [...(rows ?? []), created]);
        toast("Category added");
      }
      setEditing(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the category");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(category) {
    try {
      const updated = await catalogApi.updateCategory(category.id, {
        label: category.label,
        icon: category.icon,
        primary: category.primary,
        displayOrder: category.displayOrder,
        enabled: !category.enabled,
      });
      setCategories((rows) => rows.map((c) => (c.id === updated.id ? updated : c)));
      toast(updated.enabled ? "Category enabled" : "Category disabled");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update the category");
    }
  }

  async function move(category, delta) {
    const sorted = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);
    const i = sorted.findIndex((c) => c.id === category.id);
    const j = i + delta;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    try {
      const [a, b] = await Promise.all([
        catalogApi.updateCategory(category.id, {
          label: category.label,
          icon: category.icon,
          primary: category.primary,
          displayOrder: other.displayOrder,
          enabled: category.enabled,
        }),
        catalogApi.updateCategory(other.id, {
          label: other.label,
          icon: other.icon,
          primary: other.primary,
          displayOrder: category.displayOrder,
          enabled: other.enabled,
        }),
      ]);
      setCategories((rows) => rows.map((c) => (c.id === a.id ? a : c.id === b.id ? b : c)));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't reorder");
    }
  }

  async function confirmDeleteCategory() {
    try {
      await catalogApi.deleteCategory(deleting.id);
      setCategories((rows) => rows.filter((c) => c.id !== deleting.id));
      toast("Category deleted");
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Couldn't delete the category.");
    }
  }

  /* -------------------------------------------------------------- areas */
  const [locations, setLocations] = useState(null);
  const [locError, setLocError] = useState(null);
  const [province, setProvince] = useState("on");
  const [area, setArea] = useState("");
  const [deletingArea, setDeletingArea] = useState(null);
  const [areaDeleteError, setAreaDeleteError] = useState(null);
  const [addingProvince, setAddingProvince] = useState(false);
  const [newProvince, setNewProvince] = useState("");
  const [savingProvince, setSavingProvince] = useState(false);
  const [deletingProvince, setDeletingProvince] = useState(null);
  const [provinceDeleteError, setProvinceDeleteError] = useState(null);

  const loadLocations = useCallback(async () => {
    setLocError(null);
    setLocations(null);
    try {
      setLocations(await catalogApi.listLocations());
    } catch (err) {
      setLocError(err);
    }
  }, []);

  useEffect(() => {
    if (tab === "areas") loadLocations();
  }, [tab, loadLocations]);

  const provinces = useMemo(
    () => (locations ?? []).filter((l) => l.type === "PROVINCE").sort((a, b) => a.displayOrder - b.displayOrder),
    [locations],
  );
  const areasOf = (provinceId) =>
    (locations ?? [])
      .filter((l) => l.type === "AREA" && l.parentId === provinceId)
      .sort((a, b) => a.displayOrder - b.displayOrder);

  async function addArea() {
    if (!area.trim()) return;
    try {
      const created = await catalogApi.createArea({
        label: area.trim(),
        provinceId: province,
        displayOrder: areasOf(province).length + 1,
        popular: false,
      });
      setLocations((rows) => [...(rows ?? []), created]);
      setArea("");
      toast("Area added");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add the area");
    }
  }

  async function confirmDeleteArea() {
    try {
      await catalogApi.deleteArea(deletingArea.id);
      setLocations((rows) => rows.filter((l) => l.id !== deletingArea.id));
      toast("Area removed");
      setDeletingArea(null);
    } catch (err) {
      setAreaDeleteError(err instanceof ApiError ? err.message : "Couldn't remove this area.");
    }
  }

  async function saveProvince() {
    if (!newProvince.trim()) return;
    setSavingProvince(true);
    try {
      const created = await catalogApi.createProvince({
        label: newProvince.trim(),
        displayOrder: provinces.length,
      });
      setLocations((rows) => [...(rows ?? []), created]);
      setProvince(created.id);
      setNewProvince("");
      setAddingProvince(false);
      toast("Province added");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add the province");
    } finally {
      setSavingProvince(false);
    }
  }

  async function confirmDeleteProvince() {
    try {
      await catalogApi.deleteArea(deletingProvince.id);
      setLocations((rows) => rows.filter((l) => l.id !== deletingProvince.id));
      // The select was pointing at what we just deleted; fall back to whatever's left.
      setProvince((current) =>
        current === deletingProvince.id ? (provinces.find((p) => p.id !== current)?.id ?? "") : current,
      );
      toast("Province removed");
      setDeletingProvince(null);
    } catch (err) {
      setProvinceDeleteError(err instanceof ApiError ? err.message : "Couldn't remove this province.");
    }
  }

  return (
    <>
      <AdminHeader
        title="Taxonomy"
        subtitle="Categories and area coverage"
        actions={
          canEdit &&
          (tab === "categories" ? (
            <Button size="sm" onClick={openAdd}>
              Add category
            </Button>
          ) : (
            <Button size="sm" onClick={() => setAddingProvince(true)}>
              Add province
            </Button>
          ))
        }
      />

      {!canEdit && (
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Your role can read the taxonomy but not change it.
        </p>
      )}

      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        label="Taxonomy section"
        className="mb-4 lg:max-w-xl"
      />

      {tab === "categories" && (
        <>
          {catError ? (
            <EmptyState
              icon="ShieldAlert"
              title="Couldn't load categories"
              body={catError instanceof ApiError ? catError.message : "Something went wrong."}
              action={<Button onClick={loadCategories}>Try again</Button>}
            />
          ) : categories === null ? (
            <div className="h-64 animate-pulse rounded-card bg-canvas shadow-card" />
          ) : (
            <section className={CARD}>
              <p className="mb-3 text-[13px] text-muted">
                Order is the order the category strip shows them in. Primaries ride
                the strip itself; everything else lives behind "More".
              </p>
              {categories.length === 0 ? (
                <p className="text-[14px] text-muted">No categories for this site yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {[...categories]
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((category, i) => (
                      <li key={category.id} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                          <Icon name={category.icon} className="size-[18px]" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-bold text-ink">
                            {category.label}
                            {!category.enabled && (
                              <span className="ml-2 text-[12px] font-semibold text-muted">
                                (disabled)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[12.5px] text-muted">
                            {category.id} · {category.site}
                          </p>
                        </div>

                        <label className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-muted">
                          <input
                            type="checkbox"
                            checked={category.primary}
                            disabled={!canEdit}
                            onChange={() =>
                              catalogApi
                                .updateCategory(category.id, {
                                  label: category.label,
                                  icon: category.icon,
                                  primary: !category.primary,
                                  displayOrder: category.displayOrder,
                                  enabled: category.enabled,
                                })
                                .then((updated) =>
                                  setCategories((rows) =>
                                    rows.map((c) => (c.id === updated.id ? updated : c)),
                                  ),
                                )
                                .catch((err) =>
                                  toast(err instanceof ApiError ? err.message : "Couldn't update"),
                                )
                            }
                            className="size-4 accent-[var(--brand)] disabled:opacity-40"
                          />
                          Primary
                        </label>

                        {canEdit && (
                          <div className="flex shrink-0 gap-1">
                            <IconButton
                              label={`Move ${category.label} up`}
                              disabled={i === 0}
                              onClick={() => move(category, -1)}
                            >
                              <ChevronUp className="size-4" strokeWidth={2.6} />
                            </IconButton>
                            <IconButton
                              label={`Move ${category.label} down`}
                              disabled={i === categories.length - 1}
                              onClick={() => move(category, 1)}
                            >
                              <ChevronDown className="size-4" strokeWidth={2.6} />
                            </IconButton>
                            <IconButton
                              label={category.enabled ? `Disable ${category.label}` : `Enable ${category.label}`}
                              onClick={() => toggleEnabled(category)}
                            >
                              <span className="text-[11px] font-bold">
                                {category.enabled ? "On" : "Off"}
                              </span>
                            </IconButton>
                            <IconButton label={`Edit ${category.label}`} onClick={() => setEditing({ ...category })}>
                              <Pencil className="size-4" strokeWidth={2.4} />
                            </IconButton>
                            <IconButton
                              label={`Delete ${category.label}`}
                              danger
                              onClick={() => {
                                setDeleteError(null);
                                setDeleting(category);
                              }}
                            >
                              <Trash2 className="size-4" strokeWidth={2.4} />
                            </IconButton>
                          </div>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {tab === "areas" && (
        <>
          {locError ? (
            <EmptyState
              icon="ShieldAlert"
              title="Couldn't load areas"
              body={locError instanceof ApiError ? locError.message : "Something went wrong."}
              action={<Button onClick={loadLocations}>Try again</Button>}
            />
          ) : locations === null ? (
            <div className="h-64 animate-pulse rounded-card bg-canvas shadow-card" />
          ) : (
            <section className={CARD}>
              <h2 className="mb-1 text-[17px] font-extrabold text-ink">Coverage</h2>
              <p className="mb-3 text-[13px] text-muted">
                The areas each province is sold by.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex gap-2 sm:max-w-xs sm:flex-1">
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    aria-label="Province"
                    className={`${FIELD} ${border(false)} flex-1`}
                  >
                    {provinces.length === 0 && <option value="">No provinces yet</option>}
                    {provinces.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {canEdit && province && (
                    <IconButton
                      label={`Delete ${provinces.find((p) => p.id === province)?.label ?? "province"}`}
                      danger
                      onClick={() => {
                        setProvinceDeleteError(null);
                        setDeletingProvince(provinces.find((p) => p.id === province));
                      }}
                    >
                      <Trash2 className="size-4" strokeWidth={2.4} />
                    </IconButton>
                  )}
                </div>

                {canEdit && province && (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addArea();
                    }}
                  >
                    <input
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      placeholder="Add an area..."
                      aria-label="New area"
                      className={`${FIELD} ${border(false)} flex-1`}
                    />
                    <Button type="submit" disabled={!area.trim()}>
                      Add
                    </Button>
                  </form>
                )}
              </div>

              <ul className="mt-4 flex flex-wrap gap-2">
                {areasOf(province).map((a) => (
                  <li
                    key={a.id}
                    className={`flex items-center gap-1.5 rounded-xl bg-canvas py-1.5 pl-3 text-[13px] font-semibold text-ink ${
                      canEdit ? "pr-1.5" : "pr-3"
                    }`}
                  >
                    {a.label}
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${a.label}`}
                        onClick={() => {
                          setAreaDeleteError(null);
                          setDeletingArea(a);
                        }}
                        className="grid size-6 place-items-center rounded-lg text-muted hover:bg-line hover:text-ink"
                      >
                        <Trash2 className="size-3.5" strokeWidth={2.6} />
                      </button>
                    )}
                  </li>
                ))}
                {province && areasOf(province).length === 0 && (
                  <li className="text-[14px] text-muted">No areas yet — this province is sold as one.</li>
                )}
                {!province && (
                  <li className="text-[14px] text-muted">Add a province to start covering areas under it.</li>
                )}
              </ul>
            </section>
          )}
        </>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit category" : "Add a category"}
        size="max-w-md"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!editing?.label.trim() || !editing?.icon.trim() || saving}
              onClick={saveCategory}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Label">
              <input
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                autoFocus
                placeholder="Musical Instruments"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Icon" hint="Any name in the shared icon registry">
              <input
                value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                placeholder="Tag"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            {!editing.id && (
              <Field label="Site">
                <select
                  value={editing.site}
                  onChange={(e) => setEditing({ ...editing, site: e.target.value })}
                  className={`${FIELD} ${border(false)}`}
                >
                  <option value="MARKETPLACE">Marketplace</option>
                  <option value="PERSONALS">Personals</option>
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={editing.primary}
                onChange={(e) => setEditing({ ...editing, primary: e.target.checked })}
                className="size-4 accent-[var(--brand)]"
              />
              Show on the category strip
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={addingProvince}
        title="Add a province"
        size="max-w-md"
        onClose={() => {
          setAddingProvince(false);
          setNewProvince("");
        }}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => {
                setAddingProvince(false);
                setNewProvince("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!newProvince.trim() || savingProvince}
              onClick={saveProvince}
            >
              {savingProvince ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <Field label="Label">
          <input
            value={newProvince}
            onChange={(e) => setNewProvince(e.target.value)}
            autoFocus
            placeholder="British Columbia"
            className={`${FIELD} ${border(false)}`}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingProvince)}
        title={`Delete ${deletingProvince?.label}?`}
        body={
          provinceDeleteError ??
          "This is refused if the province still has areas under it, or any active listing still references it."
        }
        confirmLabel="Delete"
        destructive
        onClose={() => {
          setDeletingProvince(null);
          setProvinceDeleteError(null);
        }}
        onConfirm={confirmDeleteProvince}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.label}?`}
        body={
          deleteError ??
          "Its launcher tile comes down with it. This is refused if any active listing still references it."
        }
        confirmLabel="Delete"
        destructive
        onClose={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDeleteCategory}
      />

      <ConfirmDialog
        open={Boolean(deletingArea)}
        title={`Remove ${deletingArea?.label}?`}
        body={
          areaDeleteError ??
          "This is refused if any active listing still references it."
        }
        confirmLabel="Remove"
        destructive
        onClose={() => {
          setDeletingArea(null);
          setAreaDeleteError(null);
        }}
        onConfirm={confirmDeleteArea}
      />
    </>
  );
}

function IconButton({ label, danger = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-xl border border-line transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        danger ? "text-danger hover:bg-danger-soft" : "text-muted hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
