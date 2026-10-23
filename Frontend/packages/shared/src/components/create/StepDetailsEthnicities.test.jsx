import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useState } from "react";
import StepDetails from "./StepDetails.jsx";
import { EMPTY_DRAFT } from "../../lib/adDraft.js";
import { getEthnicities } from "../../lib/api/catalog.js";
vi.mock("../../lib/api/catalog.js", () => ({ getEthnicities: vi.fn() }));
vi.mock("./CategoryPicker", () => ({ default: () => null }));
beforeEach(() => vi.resetAllMocks());
const initial = { ...EMPTY_DRAFT, category: "Dating", categoryId: "dating" };

test("new and edit forms show administrator-created ethnicity choices", async () => {
  getEthnicities.mockResolvedValue([
    { id: "custom", label: "Regional, mixed" },
  ]);
  const onPatch = vi.fn();
  render(<StepDetails draft={initial} errors={{}} onPatch={onPatch} />);
  expect(screen.getByText("Loading ethnicities...")).toBeTruthy();
  fireEvent.click(
    await screen.findByRole("button", { name: "Regional, mixed" }),
  );
  expect(onPatch).toHaveBeenCalledWith({ ethnicity: "Regional, mixed" });
  expect(screen.queryByRole("button", { name: "Asian" })).toBeNull();
});

test("retiring a choice never silently clears a saved ad value", async () => {
  getEthnicities
    .mockResolvedValueOnce([{ id: "old", label: "Historical" }])
    .mockResolvedValue([{ id: "new", label: "New choice" }]);
  const changes = vi.fn();
  function Edit() {
    const [draft, setDraft] = useState({ ...initial, ethnicity: "Historical" });
    return (
      <StepDetails
        draft={draft}
        errors={{}}
        onPatch={(patch) => {
          changes(patch);
          setDraft((current) => ({ ...current, ...patch }));
        }}
      />
    );
  }
  render(<Edit />);
  await waitFor(() =>
    expect(screen.queryByText("Loading ethnicities...")).toBeNull(),
  );
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByRole("button", { name: "New choice" });
  expect(
    screen
      .getByRole("button", { name: "Historical" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByText("Your saved ethnicity is kept unless you change it."),
  ).toBeTruthy();
  expect(changes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Prefer not to say" }));
  expect(changes).toHaveBeenCalledWith({ ethnicity: "" });
  expect(screen.queryByRole("button", { name: "Historical" })).toBeNull();
});

test("catalog failure shows retry with no mock fallback and keeps the optional opt-out", async () => {
  getEthnicities
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue([{ id: "retry", label: "Recovered" }]);
  render(<StepDetails draft={initial} errors={{}} onPatch={vi.fn()} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Prefer not to say" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Asian" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry ethnicities" }));
  expect(await screen.findByRole("button", { name: "Recovered" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("ordinary Marketplace ads do not request the optional Personals catalog", () => {
  render(
    <StepDetails
      draft={{ ...initial, category: "Property" }}
      errors={{}}
      onPatch={vi.fn()}
    />,
  );
  expect(getEthnicities).not.toHaveBeenCalled();
  expect(screen.queryByText("Ethnicity")).toBeNull();
});
