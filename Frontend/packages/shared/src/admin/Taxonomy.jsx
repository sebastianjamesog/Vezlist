"use client";

import { useCallback, useEffect, useState } from "react";
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
import EthnicityTaxonomy from "./EthnicityTaxonomy.jsx";
import LocationTaxonomy from "./LocationTaxonomy.jsx";

/**
 * Categories and areas, over `AdminCatalogController` (categories + locations
 * CRUD; delete answers 409 `CATALOG_ENTRY_IN_USE` when active listings still
 * reference the entry, shown inline rather than crashing).
 *
 * Personals ethnicity options have their own catalog; removing an option
 * preserves the value already stored on existing ads.
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
  const [selectedTab, setTab] = useQueryParam("tab", "categories");
  const [site] = useSiteScope();
  const tab = selectedTab === "ethnicities" && site === "marketplace" ? "categories" : selectedTab;
  const tabs = site === "marketplace" ? TABS : [...TABS, { value: "ethnicities", label: "Ethnicity" }];
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
    if (saving) return;
    setSaving(true);
    try {
      const updated = await catalogApi.moveCategory(category.id, delta);
      setCategories((rows) => [...rows.filter((row) => row.site !== category.site), ...updated]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't reorder");
    } finally { setSaving(false); }
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

  const orderedCategories = [...(categories ?? [])].sort((a, b) =>
    a.site.localeCompare(b.site) || a.displayOrder - b.displayOrder || a.label.localeCompare(b.label));
  return (
    <>
      <AdminHeader
        title="Taxonomy"
        subtitle="Categories, Personals ethnicities and area coverage"
        actions={
          canEdit &&
          (tab === "categories" ? (
            <Button size="sm" onClick={openAdd}>
              Add category
            </Button>
          ) : null)
        }
      />

      {!canEdit && (
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Your role can read the taxonomy but not change it.
        </p>
      )}

      <SegmentedControl
        options={tabs}
        value={tab}
        onChange={setTab}
        label="Taxonomy section"
        className="mb-4 lg:max-w-xl"
      />

      {tab === "ethnicities" && <EthnicityTaxonomy />}

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
                  {orderedCategories.map((category, i) => (
                      <li key={category.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                          <Icon name={category.icon} className="size-[18px]" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0 basis-24 flex-1">
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
                            disabled={!canEdit || saving}
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
                              disabled={saving || i === 0 || orderedCategories[i - 1]?.site !== category.site}
                              onClick={() => move(category, -1)}
                            >
                              <ChevronUp className="size-4" strokeWidth={2.6} />
                            </IconButton>
                            <IconButton
                              label={`Move ${category.label} down`}
                              disabled={saving || orderedCategories[i + 1]?.site !== category.site}
                              onClick={() => move(category, 1)}
                            >
                              <ChevronDown className="size-4" strokeWidth={2.6} />
                            </IconButton>
                            <IconButton
                              label={category.enabled ? `Disable ${category.label}` : `Enable ${category.label}`}
                              disabled={saving}
                              onClick={() => toggleEnabled(category)}
                            >
                              <span className="text-[11px] font-bold">
                                {category.enabled ? "On" : "Off"}
                              </span>
                            </IconButton>
                            <IconButton disabled={saving} label={`Edit ${category.label}`} onClick={() => setEditing({ ...category })}>
                              <Pencil className="size-4" strokeWidth={2.4} />
                            </IconButton>
                            <IconButton
                              label={`Delete ${category.label}`}
                              disabled={saving}
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

      {tab === "areas" && <LocationTaxonomy />}

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
