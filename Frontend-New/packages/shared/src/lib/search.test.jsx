import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "../../../../testing/render.jsx";
import SearchBar from "../components/ui/SearchBar";

/**
 * `SearchBar`'s combobox half — the keyboard and pointer behaviour that
 * `lib/search.js`'s `search.test.js` cannot see because it never touches the
 * DOM. `lib/filters.test.js` and `lib/search.js`'s own suite already prove
 * *what* gets suggested; this proves the WAI-ARIA APG "Editable Combobox
 * With List Autocomplete" contract the popup around those suggestions has to
 * hold — `aria-expanded`, `aria-activedescendant`, arrow keys, Enter,
 * Escape.
 *
 * `suggestions` is passed as a fixed list throughout rather than derived
 * from what's typed — how a caller turns a query into rows is
 * `BrowseScreen`'s job (and `suggest`'s, covered in `search.test.js`), not
 * this component's.
 */

const items = [
  { id: "a", label: "Aardvark" },
  { id: "b", label: "Bison" },
];

describe("SearchBar — plain mode", () => {
  test("carries no combobox semantics when `suggestions` is never passed", () => {
    render(<SearchBar value="" onChange={vi.fn()} label="Search ads" />);
    const box = screen.getByRole("searchbox", { name: "Search ads" });
    expect(box.getAttribute("role")).toBe(null);
    expect(box.getAttribute("aria-expanded")).toBe(null);
    expect(box.getAttribute("aria-controls")).toBe(null);
    expect(screen.queryByRole("listbox")).toBe(null);
  });
});

describe("SearchBar — combobox mode", () => {
  test("is closed until focused, and opens onto its listbox", async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={vi.fn()}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={vi.fn()}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBe(null);

    await user.click(box);
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(box.getAttribute("aria-controls")).toBe(
      screen.getByRole("listbox").id,
    );
    expect(screen.getByRole("option", { name: "Aardvark" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Bison" })).toBeTruthy();
  });

  test("ArrowDown walks aria-activedescendant through the options and wraps", async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={vi.fn()}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={vi.fn()}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);

    await user.keyboard("{ArrowDown}");
    const first = screen.getByRole("option", { name: "Aardvark" });
    expect(box.getAttribute("aria-activedescendant")).toBe(first.id);
    expect(first.getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowDown}");
    const second = screen.getByRole("option", { name: "Bison" });
    expect(box.getAttribute("aria-activedescendant")).toBe(second.id);
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(first.getAttribute("aria-selected")).toBe("false");

    // Wraps back to the first option rather than stopping at the last.
    await user.keyboard("{ArrowDown}");
    expect(box.getAttribute("aria-activedescendant")).toBe(first.id);
  });

  test("ArrowUp from the top wraps to the last option", async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={vi.fn()}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={vi.fn()}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);
    await user.keyboard("{ArrowUp}");
    const last = screen.getByRole("option", { name: "Bison" });
    expect(box.getAttribute("aria-activedescendant")).toBe(last.id);
  });

  test("Enter with an option highlighted chooses it and closes the popup", async () => {
    const onSelectSuggestion = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={vi.fn()}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={onSelectSuggestion}
        onSubmit={onSubmit}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSelectSuggestion).toHaveBeenCalledWith(items[0]);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBe(null);
  });

  test("Enter with nothing highlighted submits the typed value instead", async () => {
    const onSelectSuggestion = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar
        value="oak dresser"
        onChange={vi.fn()}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={onSelectSuggestion}
        onSubmit={onSubmit}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);
    await user.keyboard("{Enter}");

    expect(onSelectSuggestion).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith("oak dresser");
  });

  test("Escape closes the popup and leaves the typed value untouched", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar
        value="oak"
        onChange={onChange}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={vi.fn()}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);
    expect(box.getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{Escape}");
    expect(box.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBe(null);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("clicking an option chooses it without the popup closing out from under the click", async () => {
    const onSelectSuggestion = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={vi.fn()}
        label="Search ads"
        suggestions={items}
        onSelectSuggestion={onSelectSuggestion}
      />,
    );

    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);
    await user.click(screen.getByRole("option", { name: "Bison" }));

    expect(onSelectSuggestion).toHaveBeenCalledWith(items[1]);
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  test("an empty suggestions list is a combobox with nothing to show — no popup, no crash", async () => {
    const user = userEvent.setup();
    render(
      <SearchBar
        value=""
        onChange={vi.fn()}
        label="Search ads"
        suggestions={[]}
        onSelectSuggestion={vi.fn()}
      />,
    );
    const box = screen.getByRole("combobox", { name: "Search ads" });
    await user.click(box);
    expect(screen.queryByRole("listbox")).toBe(null);
    // ArrowDown with nothing to move through does not throw.
    await user.keyboard("{ArrowDown}");
    expect(box.getAttribute("aria-activedescendant")).toBe(null);
  });
});
