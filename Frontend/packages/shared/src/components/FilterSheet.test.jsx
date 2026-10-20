import { describe, expect, test, vi } from "vitest";
import {
  render,
  screen,
  userEvent,
  within,
} from "../../../../testing/render.jsx";
import FilterSheet from "./FilterSheet";
import { DEFAULT_FILTERS } from "../lib/filters";
import { listings, personalsListings } from "../data/mock";
import { categories } from "../data/mock";
import { setCategories } from "../lib/taxonomy.js";

setCategories(categories);

/**
 * The two-pane filter sheet.
 *
 * `lib/filters.test.js` already proves `applyFilters` and
 * `reconcileSubcategory` in isolation. What it cannot see is the half of the
 * contract that lives in this component: that the draft is local until Apply,
 * that the sub-category list only appears under exactly one checked category,
 * and that reopening starts from what is applied rather than from wherever the
 * last, abandoned edit left off. Those are the bugs a filter sheet actually
 * ships.
 */
const open = (props = {}) =>
  render(
    <FilterSheet
      open
      filters={DEFAULT_FILTERS}
      listings={listings}
      query=""
      onClose={props.onClose ?? (() => {})}
      onApply={props.onApply ?? (() => {})}
      {...props}
    />,
  );

const group = (name) => screen.getByRole("button", { name });
const applyButton = () =>
  screen.getByRole("button", { name: "Apply filters" });

describe("FilterSheet", () => {
  test("Verified first applies a sort without enabling verified-only filtering", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    open({ onApply });
    await user.click(screen.getByRole("radio", { name: "Verified first" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ sort: "verified-first", verifiedOnly: false }));
  });

  test("opens on Sort by, and the rail marks where you are", async () => {
    const user = userEvent.setup();
    open();
    expect(group("Sort by").getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("radiogroup", { name: "Sort by" })).toBeTruthy();

    await user.click(group("Location"));
    expect(group("Location").getAttribute("aria-current")).toBe("true");
    expect(group("Sort by").getAttribute("aria-current")).toBe("false");
    expect(screen.getByRole("radiogroup", { name: "Province" })).toBeTruthy();
  });

  test("a caller can open it straight onto a group", () => {
    open({ initialGroup: "more" });
    expect(group("More filters").getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("checkbox", { name: "Verified ads only" }),
    ).toBeTruthy();
  });

  test("a group the sheet stops offering falls back to Sort by", () => {
    // Category is marketplace-only, so a sheet that switches boards while
    // sitting on it must not be left on a group with no rail entry to get back
    // from. Asserted across a re-render rather than on first mount, because
    // the reconciliation in `FilterSheet` is keyed on a *change* — a first
    // mount with `personals` and `initialGroup="category"` together would keep
    // "category" and render the marketplace list on the personals board. No
    // call site does that (both boards mount the sheet closed and pass a group
    // their own build offers), so this covers the path that exists rather than
    // asserting a guarantee the component does not currently make.
    const sheet = (personals) => (
      <FilterSheet
        open
        personals={personals}
        initialGroup="category"
        filters={DEFAULT_FILTERS}
        listings={listings}
        query=""
        onClose={() => {}}
        onApply={() => {}}
      />
    );
    const { rerender } = render(sheet(false));
    expect(group("Category").getAttribute("aria-current")).toBe("true");

    rerender(sheet(true));
    expect(screen.queryByRole("button", { name: "Category" })).toBe(null);
    expect(group("Sort by").getAttribute("aria-current")).toBe("true");
  });

  test("the personals board is not offered the Category group", () => {
    open({ personals: true });
    expect(screen.queryByRole("button", { name: "Category" })).toBe(null);
    expect(screen.getByRole("button", { name: "Sort by" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Location" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More filters" })).toBeTruthy();
  });

  test("the marketplace is not offered 'Available now'", () => {
    // Its rows carry no availability claim, so the switch would narrow
    // nothing. Absent rather than shown disabled: a control that cannot do
    // anything on this board is not a control this board has.
    open({ initialGroup: "more" });
    expect(screen.queryByRole("checkbox", { name: "Available now" })).toBe(
      null,
    );
    expect(
      screen.getByRole("checkbox", { name: "Verified ads only" }),
    ).toBeTruthy();
  });

  test("the personals sheet can set and hand over 'Available now'", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    open({
      personals: true,
      initialGroup: "more",
      listings: personalsListings,
      onApply,
    });

    const row = screen.getByRole("checkbox", { name: "Available now" });
    expect(row.getAttribute("aria-checked")).toBe("false");

    await user.click(row);
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect(onApply).not.toHaveBeenCalled();

    await user.click(applyButton());
    expect(onApply.mock.calls[0][0]).toMatchObject({ availableOnly: true });
  });

  test("availability stays a draft until applied without claiming a partial-page result count", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    open({ personals: true, initialGroup: "more", listings: personalsListings.slice(0, 1), onApply });
    await user.click(screen.getByRole("checkbox", { name: "Available now" }));
    expect(applyButton().textContent).toBe("Apply filters");
    expect(onApply).not.toHaveBeenCalled();
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ availableOnly: true }));
  });

  test("editing changes nothing until Apply, and then hands over the draft", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    open({ onApply });

    await user.click(screen.getByRole("radio", { name: "Price: Low to High" }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ sort: "price-asc" });
  });

  test("verified-only applies even when the currently loaded page has no matching ads", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    open({ listings: [], onApply });
    await user.click(group("More filters"));
    await user.click(screen.getByRole("checkbox", { name: "Verified ads only" }));
    expect(applyButton().disabled).toBe(false);
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ verifiedOnly: true }));
  });

  test("the sub-category list appears under exactly one checked category", async () => {
    const user = userEvent.setup();
    open();
    await user.click(group("Category"));

    // None checked: nothing to narrow.
    expect(screen.queryByRole("radiogroup", { name: /^Narrow / })).toBe(null);

    await user.click(screen.getByRole("checkbox", { name: "Vehicles" }));
    const narrow = screen.getByRole("radiogroup", { name: "Narrow Vehicles" });
    expect(
      within(narrow).getByRole("radio", { name: "All of Vehicles" }),
    ).toBeTruthy();

    // A second category and the sub-list has nothing left to be a sub-list of.
    await user.click(screen.getByRole("checkbox", { name: "Property" }));
    expect(screen.queryByRole("radiogroup", { name: /^Narrow / })).toBe(null);
  });

  test("adding a second category drops a sub-category that no longer has a referent", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    open({ onApply });
    await user.click(group("Category"));

    await user.click(screen.getByRole("checkbox", { name: "Vehicles" }));
    const sub = within(
      screen.getByRole("radiogroup", { name: "Narrow Vehicles" }),
    ).getAllByRole("radio")[1];
    const subLabel = sub.textContent;
    await user.click(sub);

    await user.click(screen.getByRole("checkbox", { name: "Property" }));
    await user.click(applyButton());

    const applied = onApply.mock.calls[0][0];
    expect(applied.categories).toEqual(["Vehicles", "Property"]);
    expect(applied.subcategory).toBe(null);
    expect(subLabel.length).toBeGreaterThan(0);
  });

  test("'All of X' is the way back out of a sub-category", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    open({ onApply });
    await user.click(group("Category"));
    await user.click(screen.getByRole("checkbox", { name: "Vehicles" }));

    const narrow = () =>
      screen.getByRole("radiogroup", { name: "Narrow Vehicles" });
    await user.click(within(narrow()).getAllByRole("radio")[1]);
    expect(
      within(narrow())
        .getByRole("radio", { name: "All of Vehicles" })
        .getAttribute("aria-checked"),
    ).toBe("false");

    await user.click(
      within(narrow()).getByRole("radio", { name: "All of Vehicles" }),
    );
    await user.click(applyButton());
    expect(onApply.mock.calls[0][0].subcategory).toBe(null);
    // The category itself survives; only the narrowing was undone.
    expect(onApply.mock.calls[0][0].categories).toEqual(["Vehicles"]);
  });

  test("choosing a province reveals its areas and drops the previous ones", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    open({ onApply });
    await user.click(group("Location"));

    const provinces = screen.getByRole("radiogroup", { name: "Province" });
    const bc = within(provinces).getByRole("radio", {
      name: "British Columbia",
    });
    await user.click(bc);

    const areas = screen.getAllByRole("checkbox");
    expect(areas.length).toBeGreaterThan(0);
    await user.click(areas[0]);

    // Switching province must not carry an area the new province has never
    // heard of into the applied filters.
    await user.click(within(provinces).getByRole("radio", { name: "Ontario" }));
    await user.click(applyButton());
    expect(onApply.mock.calls[0][0].cities).toEqual([]);
  });

  test("Clear all resets the draft to the defaults", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    open({ onApply, initialGroup: "more" });

    await user.click(
      screen.getByRole("checkbox", { name: "Verified ads only" }),
    );
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await user.click(applyButton());

    expect(onApply.mock.calls[0][0]).toEqual(DEFAULT_FILTERS);
  });

  test("reopening starts from what is applied, not from the abandoned edit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FilterSheet
        open
        filters={DEFAULT_FILTERS}
        listings={listings}
        query=""
        initialGroup="more"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );

    const verified = () =>
      screen.getByRole("checkbox", { name: "Verified ads only" });
    await user.click(verified());
    expect(verified().getAttribute("aria-checked")).toBe("true");

    const sheet = (open) => (
      <FilterSheet
        open={open}
        filters={DEFAULT_FILTERS}
        listings={listings}
        query=""
        initialGroup="more"
        onClose={() => {}}
        onApply={() => {}}
      />
    );
    rerender(sheet(false));
    rerender(sheet(true));

    expect(verified().getAttribute("aria-checked")).toBe("false");
  });

  test("closing is the sheet's own affair — Escape and the X both call onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    open({ onClose });

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
