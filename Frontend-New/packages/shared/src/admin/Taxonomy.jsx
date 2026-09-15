"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import SegmentedControl from "../components/ui/SegmentedControl";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Icon from "../components/ui/Icon";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { inScope, useQueryParam, useSiteScope } from "../lib/adminScope";

/**
 * Categories, the home launcher, and where the sites think Canada is.
 *
 * The launcher is the fussy one: it is a three-by-three grid on the public
 * home screen, so it holds exactly nine tiles in a fixed order. The screen
 * enforces both — it will not let you save eight or ten — because a launcher
 * with a hole in it is a bug that ships silently.
 */

/**
 * Which board each section describes.
 *
 * The site switcher is a global control, so a screen it cannot move looks
 * broken rather than inapplicable. Taxonomy *is* site-specific — the nineteen
 * categories and the launcher are the marketplace's, the two word-lists are the
 * board's — so the scope picks the sections rather than doing nothing. Areas
 * are shared and always show.
 */
const TABS = [
  { value: "categories", label: "Categories", site: "marketplace" },
  { value: "home", label: "Home grid", site: "marketplace" },
  { value: "personals", label: "Personals", site: "personals" },
  { value: "areas", label: "Areas" },
];

const HOME_SLOTS = 9;
// `subs` starts empty rather than absent: a new category is expandable the
// moment it is saved, and every row on the screen then has the same shape.
const EMPTY_CATEGORY = { label: "", icon: "Tag", primary: false, subs: [] };

export default function Taxonomy() {
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  /**
   * Every write on this screen is one permission, so it is read once.
   *
   * The reducer refuses all of them for anyone else anyway — that is the point
   * of `ACTION_PERMISSION` — but a console that leaves the buttons up and
   * silently drops the dispatch is worse than one that never offered them: a
   * moderator reorders the category strip, sees nothing move, and files a bug.
   */
  const canEdit = can("taxonomy.edit");
  // In the URL, like every other filter in the console — four sections is
  // enough that "the areas tab" is worth being able to send someone.
  const [rawTab, setTab] = useQueryParam("tab", "categories");
  const [site] = useSiteScope();

  const tabs = TABS.filter((t) => !t.site || inScope(t, site));
  // Scoping away the section you were on has to land you somewhere real, not
  // on a blank panel.
  const tab = tabs.some((t) => t.value === rawTab) ? rawTab : tabs[0].value;
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  // One category's sub-categories open at a time. Nineteen accordions all open
  // at once is a page you scroll past rather than a page you edit.
  const [openId, setOpenId] = useState(null);
  const [droppingSub, setDroppingSub] = useState(null);

  /**
   * Ads per (category, sub-category), tallied once for the whole screen.
   *
   * This is what makes a removal's cost visible before the click rather than
   * explained after it — "Boats · 9 ads" beside the bin. Counting inside the
   * row instead would walk all seventy listings nineteen times over, once per
   * render, for a number that only changes when the listings do.
   *
   * Keyed on the id *and* the label because a sub-category label is not unique
   * across the tree: "Furniture" belongs to both Buy/Sell and Home & Garden.
   */
  const subAdCounts = useMemo(() => {
    const tally = new Map();
    for (const l of state.listings) {
      if (!l.subcategory) continue;
      const key = `${l.categoryId}|${l.subcategory}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return tally;
  }, [state.listings]);

  const adsUnder = (categoryId, sub) =>
    subAdCounts.get(`${categoryId}|${sub}`) ?? 0;

  // The launcher is edited as a draft and saved in one go — nine tiles is one
  // decision, not nine.
  const [draft, setDraft] = useState(null);
  const home = draft ?? state.homeCategories;
  const dirty = draft !== null;

  const [province, setProvince] = useState("on");
  const [area, setArea] = useState("");

  const chosen = state.provinces.find((p) => p.id === province);

  function saveCategory() {
    if (!editing.label.trim()) return;
    dispatch({ type: "upsertCategory", category: editing });
    toast(editing.id ? "Category updated" : "Category added");
    setEditing(null);
  }

  function toggleTile(id) {
    if (!canEdit) return;
    if (home.includes(id)) {
      setDraft(home.filter((c) => c !== id));
      return;
    }
    // A full grid rejects the tap rather than silently swapping something out.
    // Returning early also matters: falling through to setDraft(home) would
    // mark the grid dirty and offer to save a change nobody made.
    if (home.length >= HOME_SLOTS) {
      toast(`The grid holds ${HOME_SLOTS} tiles — drop one first`);
      return;
    }
    setDraft([...home, id]);
  }

  return (
    <>
      <AdminHeader
        title="Taxonomy"
        subtitle="Categories, the home launcher, and coverage"
        actions={
          tab === "categories" &&
          canEdit && (
            <Button size="sm" onClick={() => setEditing({ ...EMPTY_CATEGORY })}>
              Add category
            </Button>
          )
        }
      />

      {!canEdit && (
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Your role can read the taxonomy but not change it — every list here is
          the owner’s.
        </p>
      )}

      <SegmentedControl
        options={tabs}
        value={tab}
        onChange={setTab}
        label="Taxonomy section"
        className="mb-4 lg:max-w-xl"
      />

      {tab === "categories" && (
        <section className={CARD}>
          <p className="mb-3 text-[13px] text-muted">
            Order is the order the category strip shows them in. Primaries ride
            the strip itself; everything else lives behind “More”. Open a
            category to edit the sub-categories underneath it.
          </p>
          <ul className="divide-y divide-line">
            {state.categories.map((category, i) => {
              const subs = category.subs ?? [];
              const open = openId === category.id;
              return (
                <li key={category.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                      <Icon
                        name={category.icon}
                        className="size-[18px]"
                        strokeWidth={2.4}
                      />
                    </span>

                    {/**
                     * The name is the disclosure control rather than a chevron
                     * beside it. Sub-categories are a property of the category,
                     * so the whole row reads as the thing being opened — and it
                     * gives the tap a target the size of the label instead of a
                     * 16px arrow.
                     */}
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`subs-${category.id}`}
                      onClick={() => setOpenId(open ? null : category.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-canvas"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-bold text-ink">
                          {category.label}
                        </span>
                        <span className="block truncate text-[12.5px] text-muted">
                          {category.id} ·{" "}
                          {subs.length === 1
                            ? "1 sub-category"
                            : `${subs.length} sub-categories`}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        strokeWidth={2.6}
                        className={`size-4 shrink-0 text-muted transition-transform ${
                          open ? "rotate-90" : ""
                        }`}
                      />
                    </button>

                    <label className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-muted">
                      <input
                        type="checkbox"
                        checked={category.primary}
                        disabled={!canEdit}
                        onChange={() =>
                          dispatch({
                            type: "upsertCategory",
                            category: {
                              ...category,
                              primary: !category.primary,
                            },
                          })
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
                          onClick={() =>
                            dispatch({
                              type: "reorderCategories",
                              id: category.id,
                              delta: -1,
                            })
                          }
                        >
                          <ChevronUp className="size-4" strokeWidth={2.6} />
                        </IconButton>
                        <IconButton
                          label={`Move ${category.label} down`}
                          disabled={i === state.categories.length - 1}
                          onClick={() =>
                            dispatch({
                              type: "reorderCategories",
                              id: category.id,
                              delta: 1,
                            })
                          }
                        >
                          <ChevronDown className="size-4" strokeWidth={2.6} />
                        </IconButton>
                        <IconButton
                          label={`Edit ${category.label}`}
                          onClick={() => setEditing({ ...category })}
                        >
                          <Pencil className="size-4" strokeWidth={2.4} />
                        </IconButton>
                        <IconButton
                          label={`Delete ${category.label}`}
                          danger
                          onClick={() => setDeleting(category)}
                        >
                          <Trash2 className="size-4" strokeWidth={2.4} />
                        </IconButton>
                      </div>
                    )}
                  </div>

                  {open && (
                    <div
                      id={`subs-${category.id}`}
                      className="mt-2 rounded-xl bg-canvas p-3 sm:ml-12"
                    >
                      <TermList
                        blurb={`The second and last level under ${category.label}. It is optional at every point it is asked for — an ad may sit directly in ${category.label} — so this list narrows the feed rather than gating the post.`}
                        terms={subs}
                        placeholder="Add a sub-category..."
                        editable={canEdit}
                        className=""
                        empty={`None yet — ads here sit directly in ${category.label}.`}
                        // The count is what makes the bin beside it honest.
                        meta={(sub) => {
                          const n = adsUnder(category.id, sub);
                          return n === 1 ? "1 ad" : `${n} ads`;
                        }}
                        onAdd={(value) => {
                          dispatch({
                            type: "addSubcategory",
                            categoryId: category.id,
                            value,
                          });
                          toast(`Added to ${category.label}`);
                        }}
                        onRename={(from, to) => {
                          dispatch({
                            type: "renameSubcategory",
                            categoryId: category.id,
                            from,
                            to,
                          });
                          toast("Sub-category renamed");
                        }}
                        onReorder={(value, delta) =>
                          dispatch({
                            type: "reorderSubcategory",
                            categoryId: category.id,
                            value,
                            delta,
                          })
                        }
                        // Straight to the dialog rather than to the dispatch:
                        // this is the one control on the screen that moves ads
                        // it is not naming.
                        onRemove={(value) =>
                          setDroppingSub({
                            category,
                            sub: value,
                            ads: adsUnder(category.id, value),
                          })
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {tab === "home" && (
        <section className={CARD}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold text-ink">
                Home launcher
              </h2>
              <p className="text-[13px] text-muted">
                {home.length} of {HOME_SLOTS} tiles chosen, in this order.
                “personals” is not a category — it is the doorway to the other
                site.
              </p>
            </div>
            {dirty && canEdit && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft(null)}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={home.length !== HOME_SLOTS}
                  onClick={() => {
                    dispatch({ type: "setHomeCategories", ids: home });
                    setDraft(null);
                    toast("Home grid saved");
                  }}
                >
                  Save grid
                </Button>
              </div>
            )}
          </div>

          <ol className="mb-4 grid grid-cols-3 gap-2 sm:max-w-md">
            {Array.from({ length: HOME_SLOTS }, (_, i) => {
              const id = home[i];
              const category = state.categories.find((c) => c.id === id);
              return (
                <li
                  key={i}
                  className={`flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl text-center ${
                    id ? "bg-brand-soft" : "border-2 border-dashed border-line"
                  }`}
                >
                  {id ? (
                    <>
                      <Icon
                        name={category?.icon ?? "VenusAndMars"}
                        className="size-6 text-brand"
                        strokeWidth={2.2}
                      />
                      <span className="px-1 text-[11.5px] font-bold leading-tight text-brand">
                        {category?.label ?? "Personals"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[12px] font-semibold text-muted">
                      Slot {i + 1}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {canEdit && (
            <>
              <h3 className="mb-2 text-[14px] font-bold text-ink">
                Tap to add or remove
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "personals", label: "Personals" },
                  ...state.categories,
                ].map((c) => {
                  const on = home.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTile(c.id)}
                      className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                        on
                          ? "bg-brand text-on-brand"
                          : "bg-canvas text-ink hover:bg-line"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {tab === "personals" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TermList
            title="Post categories"
            blurb="What a personals post is for. The marketplace's nineteen categories name objects and none of them fits a person, so the board carries its own list. Order is the order the picker offers them in."
            terms={state.personalsCategories}
            placeholder="Add a category..."
            editable={canEdit}
            empty="Empty — the board would offer nothing to choose from."
            onAdd={(value) => {
              dispatch({ type: "addTerm", list: "personalsCategories", value });
              toast("Added to post categories");
            }}
            onReorder={(value, delta) =>
              dispatch({
                type: "reorderTerm",
                list: "personalsCategories",
                value,
                delta,
              })
            }
            onRemove={(value) => {
              dispatch({
                type: "removeTerm",
                list: "personalsCategories",
                value,
              });
              toast("Removed");
            }}
          />
          <TermList
            title="Ethnicities"
            blurb="Self-described, and only on this board. Kept flat rather than as a tree: people pick the word they use for themselves, and a taxonomy would make them pick twice."
            terms={state.ethnicities}
            placeholder="Add an option..."
            editable={canEdit}
            empty="Empty — the board would offer nothing to choose from."
            onAdd={(value) => {
              dispatch({ type: "addTerm", list: "ethnicities", value });
              toast("Added to ethnicities");
            }}
            onReorder={(value, delta) =>
              dispatch({
                type: "reorderTerm",
                list: "ethnicities",
                value,
                delta,
              })
            }
            onRemove={(value) => {
              dispatch({ type: "removeTerm", list: "ethnicities", value });
              toast("Removed");
            }}
          />
        </div>
      )}

      {tab === "areas" && (
        <section className={CARD}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">Coverage</h2>
          <p className="mb-3 text-[13px] text-muted">
            The areas each province is sold by. Ontario, Quebec and BC go by
            region; the rest go by city.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              aria-label="Province"
              className={`${FIELD} ${border(false)} sm:max-w-xs`}
            >
              {state.provinces
                .filter((p) => p.id !== "all")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </select>

            {canEdit && (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!area.trim()) return;
                  dispatch({ type: "addArea", provinceId: province, area });
                  setArea("");
                  toast("Area added");
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
            {chosen?.areas.map((a) => (
              <li
                key={a}
                className={`flex items-center gap-1.5 rounded-xl bg-canvas py-1.5 pl-3 text-[13px] font-semibold text-ink ${
                  canEdit ? "pr-1.5" : "pr-3"
                }`}
              >
                {a}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remove ${a}`}
                    onClick={() => {
                      dispatch({
                        type: "removeArea",
                        provinceId: province,
                        area: a,
                      });
                      toast("Area removed");
                    }}
                    className="grid size-6 place-items-center rounded-lg text-muted hover:bg-line hover:text-ink"
                  >
                    <X className="size-3.5" strokeWidth={2.8} />
                  </button>
                )}
              </li>
            ))}
            {chosen?.areas.length === 0 && (
              <li className="text-[14px] text-muted">
                No areas yet — this province is sold as one.
              </li>
            )}
          </ul>
        </section>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit category" : "Add a category"}
        size="max-w-md"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!editing?.label.trim()}
              onClick={saveCategory}
            >
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Label">
              <input
                value={editing.label}
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
                autoFocus
                placeholder="Musical Instruments"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Icon" hint="Any name in the shared icon registry">
              <input
                value={editing.icon}
                onChange={(e) =>
                  setEditing({ ...editing, icon: e.target.value })
                }
                placeholder="Tag"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <label className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={editing.primary}
                onChange={(e) =>
                  setEditing({ ...editing, primary: e.target.checked })
                }
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
        body="Its launcher tile comes down with it. Ads already filed under it keep the label they were posted with."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          dispatch({ type: "deleteCategory", id: deleting.id });
          toast("Category deleted");
          setDeleting(null);
        }}
      />

      {/**
       * Its own dialog rather than a second use of the one above: dropping a
       * sub-category moves ads that are not being deleted, and the number of
       * them is the whole reason to stop and ask. A shared dialog with a
       * ternary in the body would say less and read worse.
       */}
      <ConfirmDialog
        open={Boolean(droppingSub)}
        title={`Remove ${droppingSub?.sub}?`}
        body={
          droppingSub?.ads
            ? `${droppingSub.ads} ${droppingSub.ads === 1 ? "ad is" : "ads are"} filed under it. Nothing is deleted — they fall back to ${droppingSub.category.label} and stay in the feed. Adding the sub-category back later will not re-file them.`
            : `No ads are filed under it, so nothing moves. It stops being offered on ${droppingSub?.category.label}.`
        }
        confirmLabel="Remove"
        destructive
        onClose={() => setDroppingSub(null)}
        onConfirm={() => {
          dispatch({
            type: "removeSubcategory",
            categoryId: droppingSub.category.id,
            value: droppingSub.sub,
          });
          toast(
            droppingSub.ads
              ? `Removed — ${droppingSub.ads} ads moved to ${droppingSub.category.label}`
              : "Sub-category removed",
          );
          setDroppingSub(null);
        }}
      />
    </>
  );
}

/** Two spellings of one word are one word, wherever this widget is used. */
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * An ordered list of plain words: add, rename, reorder, remove.
 *
 * It used to take the state key it edited and dispatch `addTerm` itself, which
 * fitted while the only two lists were top-level. Sub-categories are nested
 * under a category id and use four different verbs, so the key is now a set of
 * callbacks instead. Generalising rather than writing a second widget for the
 * nested case: a near-identical list with its own add form, its own reorder
 * buttons and its own empty state is exactly the duplication this component was
 * written to avoid the first time, and it would be the copy that quietly missed
 * the next accessibility fix.
 *
 * `onRename` and `meta` are optional — the personals vocabularies pass neither,
 * so they render exactly the three controls they always had.
 *
 * In every list here the term *is* the key: these are strings on the ad, not
 * rows with ids, which is why a duplicate has to be refused rather than
 * disambiguated.
 */
function TermList({
  title,
  blurb,
  terms,
  placeholder,
  empty,
  meta,
  editable = true,
  className = CARD,
  onAdd,
  onRename,
  onReorder,
  onRemove,
}) {
  const [draft, setDraft] = useState("");
  // `{ term, value }`, or null. Keyed by the term rather than the index so a
  // reorder underneath an open editor does not start editing its neighbour.
  const [renaming, setRenaming] = useState(null);

  const value = draft.trim();
  /**
   * Compared case-insensitively, which is stricter than `addTerm` in the store
   * is. A form may refuse more than the store does and this one should: the
   * store's job is to not corrupt the list, the form's is to explain why a
   * word will not go in, and "Boats is already here" is the true reason
   * whether or not the owner typed the B.
   */
  const exists = Boolean(value) && terms.some((t) => same(t, value));

  const renamed = renaming?.value.trim() ?? "";
  const renameClash =
    Boolean(renamed) &&
    terms.some((t) => t !== renaming.term && same(t, renamed));
  const canSaveRename = Boolean(renamed) && !renameClash;

  return (
    <section className={className}>
      {title && (
        <h2 className="text-[17px] font-extrabold text-ink">{title}</h2>
      )}
      <p className="mb-3 text-[13px] leading-relaxed text-muted">{blurb}</p>

      {editable && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!value || exists) return;
              onAdd(value);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className={`${FIELD} ${border(false)} flex-1`}
            />
            <Button type="submit" disabled={!value || exists}>
              Add
            </Button>
          </form>
          {exists && (
            <p className="mt-1.5 text-[13px] font-medium text-muted">
              Already in the list.
            </p>
          )}
        </>
      )}

      <ul className="mt-3 divide-y divide-line">
        {terms.map((term, i) =>
          renaming?.term === term ? (
            <li key={term} className="py-2">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canSaveRename) return;
                  // Typing the same word back is a cancel, not an edit — the
                  // reducer would ignore it, and a "renamed" toast for nothing
                  // is a lie.
                  if (renamed !== term) onRename(term, renamed);
                  setRenaming(null);
                }}
                // Escape leaves the editor without leaving the page, which is
                // the only way out for anyone who opened it from the keyboard.
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenaming(null);
                }}
              >
                <input
                  value={renaming.value}
                  onChange={(e) => setRenaming({ term, value: e.target.value })}
                  autoFocus
                  aria-label={`Rename ${term}`}
                  className={`${FIELD} ${border(false)} flex-1`}
                />
                <Button type="submit" disabled={!canSaveRename}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRenaming(null)}
                >
                  Cancel
                </Button>
              </form>
              {renameClash && (
                <p className="mt-1.5 text-[13px] font-medium text-muted">
                  Another entry already uses that name.
                </p>
              )}
            </li>
          ) : (
            <li key={term} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">
                {term}
              </span>
              {meta && (
                <span className="shrink-0 text-[12.5px] font-semibold text-muted">
                  {meta(term)}
                </span>
              )}
              {editable && (
                <>
                  <IconButton
                    label={`Move ${term} up`}
                    disabled={i === 0}
                    onClick={() => onReorder(term, -1)}
                  >
                    <ChevronUp className="size-4" strokeWidth={2.6} />
                  </IconButton>
                  <IconButton
                    label={`Move ${term} down`}
                    disabled={i === terms.length - 1}
                    onClick={() => onReorder(term, 1)}
                  >
                    <ChevronDown className="size-4" strokeWidth={2.6} />
                  </IconButton>
                  {onRename && (
                    <IconButton
                      label={`Rename ${term}`}
                      onClick={() => setRenaming({ term, value: term })}
                    >
                      <Pencil className="size-4" strokeWidth={2.4} />
                    </IconButton>
                  )}
                  <IconButton
                    label={`Remove ${term}`}
                    danger
                    onClick={() => onRemove(term)}
                  >
                    <Trash2 className="size-4" strokeWidth={2.4} />
                  </IconButton>
                </>
              )}
            </li>
          ),
        )}
      </ul>

      {terms.length === 0 && (
        <p className="mt-3 text-[14px] text-muted">{empty}</p>
      )}
    </section>
  );
}

function IconButton({
  label,
  danger = false,
  disabled = false,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-xl border border-line transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        danger
          ? "text-danger hover:bg-danger-soft"
          : "text-muted hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
