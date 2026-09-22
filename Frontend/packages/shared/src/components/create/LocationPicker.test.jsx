import { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { searchLocations } from "../../lib/api/catalog.js";
import StepContact from "./StepContact.jsx";

vi.mock("../../lib/api/catalog.js", () => ({ searchLocations: vi.fn() }));

const area = (
  id,
  label,
  provinceId = "bc",
  provinceLabel = "British Columbia",
) => ({
  id,
  label,
  provinceId,
  provinceLabel,
  popular: false,
});
const suggested = [area("squamish", "Squamish"), area("nelson", "Nelson")];

function Harness({ initial = {}, onPatch = () => {} }) {
  const [draft, setDraft] = useState({
    location: "",
    locationId: "",
    provinceId: "",
    email: "seller@example.com",
    phone: "1234567890",
    ...initial,
  });
  return (
    <>
      <StepContact
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
const input = () => screen.getByRole("combobox", { name: "Location" });
const flush = () => act(async () => {});
const advance = (ms = 250) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const change = (value) => {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value } });
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.useFakeTimers();
  searchLocations.mockReset().mockResolvedValue(suggested);
});

describe("Backend location picker", () => {
  test("uses backend suggestions and stores the selected IDs without changing contact fields", async () => {
    render(<Harness />);
    expect(screen.getByRole("status").textContent).toBe("Loading locations...");
    await flush();
    expect(searchLocations).toHaveBeenCalledWith("", 50);
    const group = screen.getByRole("group", { name: "Suggested locations" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Squamish", "Nelson"]);
    expect(screen.queryByRole("button", { name: "Winnipeg" })).toBe(null);
    fireEvent.click(within(group).getByRole("button", { name: "Squamish" }));
    expect(draft()).toEqual({
      location: "Squamish",
      locationId: "squamish",
      provinceId: "bc",
      email: "seller@example.com",
      phone: "1234567890",
    });
    expect(document.activeElement).toBe(input());
  });

  test("renders only the buttons that fit two measured rows and recalculates on resize", async () => {
    let perRow = 3;
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function () {
        if (!this.parentElement?.hasAttribute("data-location-measure"))
          return 0;
        return (
          Math.floor([...this.parentElement.children].indexOf(this) / perRow) *
          40
        );
      },
    );
    searchLocations.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) =>
        area(`city-${index}`, `City ${index}`),
      ),
    );
    render(<Harness />);
    await flush();
    const group = screen.getByRole("group", { name: "Suggested locations" });
    expect(within(group).getAllByRole("button")).toHaveLength(6);
    expect(
      document.querySelectorAll('[aria-hidden="true"] button'),
    ).toHaveLength(0);
    perRow = 2;
    fireEvent(window, new Event("resize"));
    expect(within(group).getAllByRole("button")).toHaveLength(4);
  });

  test("debounces backend search, shows province context, and supports keyboard selection", async () => {
    searchLocations.mockImplementation(async (query) =>
      query ? [area("halifax", "Halifax", "ns", "Nova Scotia")] : suggested,
    );
    render(<Harness />);
    await flush();
    change(" Hali ");
    expect(screen.getByRole("status").textContent).toBe(
      "Searching locations...",
    );
    await advance(249);
    expect(searchLocations).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(searchLocations).toHaveBeenLastCalledWith("Hali", 20);
    expect(
      screen.getByRole("option", { name: "Halifax Nova Scotia" }),
    ).toBeTruthy();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option").id,
    );
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(draft()).toMatchObject({
      location: "Halifax",
      locationId: "halifax",
      provinceId: "ns",
    });
    expect(screen.queryByRole("listbox")).toBe(null);
  });

  test("typing after selection immediately clears both IDs, even before search returns", async () => {
    const onPatch = vi.fn();
    render(
      <Harness
        initial={{
          location: "Squamish",
          locationId: "squamish",
          provinceId: "bc",
        }}
        onPatch={onPatch}
      />,
    );
    await flush();
    change("Squamish North");
    expect(onPatch).toHaveBeenLastCalledWith({
      location: "Squamish North",
      locationId: "",
      provinceId: "",
    });
    expect(draft()).toMatchObject({ locationId: "", provinceId: "" });
    expect(input().maxLength).toBe(120);
  });

  test("a slow earlier search cannot replace the latest backend results", async () => {
    const earlier = deferred();
    const later = deferred();
    searchLocations.mockImplementation((query) =>
      query === "Kel"
        ? earlier.promise
        : query === "Hal"
          ? later.promise
          : Promise.resolve(suggested),
    );
    render(<Harness />);
    await flush();
    change("Kel");
    await advance();
    change("Hal");
    await advance();
    await act(async () =>
      later.resolve([area("halifax", "Halifax", "ns", "Nova Scotia")]),
    );
    await act(async () => earlier.resolve([area("kelowna", "Kelowna")]));
    expect(
      screen.getByRole("option", { name: "Halifax Nova Scotia" }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Kelowna/ })).toBe(null);
  });

  test("default request failures have a working retry without mock-location fallback", async () => {
    searchLocations
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(suggested);
    render(<Harness />);
    await flush();
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load locations.",
    );
    expect(screen.queryByRole("group", { name: "Suggested locations" })).toBe(
      null,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(screen.getByRole("button", { name: "Squamish" })).toBeTruthy();
  });

  test("search failures can retry and a successful empty result is explained", async () => {
    searchLocations.mockImplementation((query) =>
      query ? Promise.reject(new Error("Offline")) : Promise.resolve(suggested),
    );
    render(<Harness />);
    await flush();
    change("Nowhere");
    await advance();
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load locations.",
    );
    searchLocations.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance();
    expect(screen.getByRole("status").textContent).toBe(
      "No locations found. Try another city, area or province.",
    );
    expect(screen.queryByRole("option")).toBe(null);
  });

  test("Escape dismisses results without escaping the containing ad form", async () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <Harness />
      </div>,
    );
    await flush();
    change("Nel");
    await advance();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBe(null);
    expect(onKeyDown).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
