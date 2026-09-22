import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { getCategories } from "../../lib/api/catalog.js";
import { EMPTY_DRAFT } from "../../lib/adDraft.js";
import CategoryPicker from "./CategoryPicker.jsx";
import StepDetails from "./StepDetails.jsx";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE = "marketplace";
});
vi.mock("../../lib/api/catalog.js", () => ({ getCategories: vi.fn() }));

const category = (id, label) => ({ id, label, icon: "tag", primary: false });
const serverCategories = [
  category("repair-work", "Local repairs"),
  category("new-collectibles", "Rare collections"),
];

function Harness({ initial = {}, onPatch = () => {} }) {
  const [draft, setDraft] = useState({
    ...EMPTY_DRAFT,
    category: "",
    categoryId: "",
    ...initial,
  });
  return (
    <>
      <StepDetails
        draft={draft}
        errors={{}}
        onPatch={(patch) => {
          onPatch(patch);
          setDraft((previous) => ({ ...previous, ...patch }));
        }}
      />
      <span data-testid="draft">{JSON.stringify(draft)}</span>
    </>
  );
}

const draft = () => JSON.parse(screen.getByTestId("draft").textContent);
const group = () => screen.getByRole("group", { name: "Category" });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolveRequest, rejectRequest) => {
    resolve = resolveRequest;
    reject = rejectRequest;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  getCategories.mockReset().mockResolvedValue(serverCategories);
});

describe("Backend category picker", () => {
  test("loads Marketplace categories from the backend and selects the exact ID", async () => {
    render(<Harness initial={{ subcategory: "Legacy value" }} />);
    expect(within(group()).getByRole("status").textContent).toBe(
      "Loading categories...",
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Rare collections" }),
    );
    expect(getCategories).toHaveBeenCalledWith("MARKETPLACE");
    expect(
      within(group())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Local repairs", "Rare collections"]);
    expect(draft()).toMatchObject({
      category: "Rare collections",
      categoryId: "new-collectibles",
      subcategory: "",
    });
    expect(screen.queryByText("Sub-category")).toBe(null);
  });

  test("duplicate backend labels remain independently selectable by ID", async () => {
    getCategories.mockResolvedValue([
      category("first-community", "Community"),
      category("second-community", "Community"),
    ]);
    render(<Harness />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Community (second-community)",
      }),
    );
    expect(draft().categoryId).toBe("second-community");
    expect(
      screen
        .getByRole("button", { name: "Community (second-community)" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Community (first-community)" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  test("a label-only saved draft prompts reselection rather than guessing an ID", async () => {
    const onPatch = vi.fn();
    render(
      <Harness initial={{ category: "Local repairs" }} onPatch={onPatch} />,
    );
    await screen.findByRole("button", { name: "Local repairs" });
    expect(draft().categoryId).toBe("");
    expect(onPatch).not.toHaveBeenCalled();
    expect(within(group()).getByRole("status").textContent).toContain(
      "Choose a category from the current list.",
    );
    expect(
      within(group())
        .getAllByRole("button")
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });

  test("an ID-backed saved draft follows backend renames and preserves its legacy attributes", async () => {
    render(
      <Harness
        initial={{
          category: "Old repairs label",
          categoryId: "repair-work",
          subcategory: "Legacy repairs",
        }}
      />,
    );
    const button = await screen.findByRole("button", { name: "Local repairs" });
    await waitFor(() => expect(draft().category).toBe("Local repairs"));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(draft()).toMatchObject({
      categoryId: "repair-work",
      subcategory: "Legacy repairs",
    });
  });

  test("only a successful current catalog can invalidate a deleted category", async () => {
    const pending = deferred();
    getCategories.mockReturnValue(pending.promise);
    render(
      <Harness
        initial={{ category: "Retired category", categoryId: "retired" }}
      />,
    );
    expect(draft().categoryId).toBe("retired");
    await act(async () => pending.resolve(serverCategories));
    expect(draft()).toMatchObject({
      category: "Retired category",
      categoryId: "",
    });
    expect(within(group()).getByRole("status").textContent).toContain(
      'Your saved category was "Retired category".',
    );
    expect(
      within(group())
        .getAllByRole("button")
        .every((button) => button.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
  });

  test("request errors retain saved IDs and retry loads the current backend catalog", async () => {
    getCategories
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(serverCategories);
    render(
      <Harness
        initial={{ category: "Local repairs", categoryId: "repair-work" }}
      />,
    );
    await screen.findByText("Could not load categories.");
    expect(draft().categoryId).toBe("repair-work");
    expect(
      within(group()).queryByRole("button", { name: "Local repairs" }),
    ).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      (
        await screen.findByRole("button", { name: "Local repairs" })
      ).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getCategories).toHaveBeenCalledTimes(2);
  });

  test("an empty backend catalog has an explicit empty state and no mock fallback", async () => {
    getCategories.mockResolvedValue([]);
    render(<Harness />);
    await screen.findByText("No categories are available for this board yet.");
    expect(within(group()).queryAllByRole("button")).toHaveLength(0);
    expect(draft().categoryId).toBe("");
  });

  test("reopening the picker refreshes backend changes instead of retaining stale options", async () => {
    const first = render(<Harness />);
    await screen.findByRole("button", { name: "Local repairs" });
    first.unmount();
    getCategories.mockResolvedValue([category("brand-new", "Fresh category")]);
    render(<Harness />);
    await screen.findByRole("button", { name: "Fresh category" });
    expect(screen.queryByRole("button", { name: "Local repairs" })).toBe(null);
    expect(getCategories).toHaveBeenCalledTimes(2);
  });

  test("concurrent pickers share the per-site query and ignore a response from a closed picker", async () => {
    const onPatch = vi.fn();
    const firstRequest = deferred();
    getCategories
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce([category("fresh", "Fresh category")]);
    const first = render(
      <CategoryPicker
        draft={{ category: "", categoryId: "" }}
        onPatch={onPatch}
      />,
    );
    const second = render(
      <CategoryPicker
        draft={{ category: "", categoryId: "" }}
        onPatch={onPatch}
      />,
    );
    await waitFor(() => expect(getCategories).toHaveBeenCalledTimes(1));
    first.unmount();
    second.unmount();
    render(<Harness />);
    await screen.findByRole("button", { name: "Fresh category" });
    await act(async () => firstRequest.resolve(serverCategories));
    expect(screen.queryByRole("button", { name: "Local repairs" })).toBe(null);
    expect(screen.getByRole("button", { name: "Fresh category" })).toBeTruthy();
  });
});
