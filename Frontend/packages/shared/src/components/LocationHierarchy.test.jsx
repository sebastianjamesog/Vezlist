import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import LocationBar from "./LocationBar.jsx";
import LocationHierarchy from "./LocationHierarchy.jsx";
import FilterSheet from "./FilterSheet.jsx";
import { DEFAULT_FILTERS } from "../lib/filters.js";
import { getLocations } from "../lib/api/catalog.js";
vi.mock("../lib/api/catalog.js", () => ({ getLocations: vi.fn() }));
const catalog = {
  provinces: [
    {
      id: "on",
      label: "Ontario",
      areas: [
        {
          id: "gta",
          label: "Greater Toronto",
          neighbourhoods: [{ id: "scar", label: "Scarborough" }],
        },
      ],
    },
    { id: "custom", label: "Custom Province", areas: [] },
  ],
  popularAreas: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  getLocations.mockResolvedValue(catalog);
});

test("LocationBar selects a neighbourhood by ID and whole region includes its descendants", async () => {
  const onPatch = vi.fn();
  render(
    <LocationBar
      filters={{ ...DEFAULT_FILTERS, categories: ["Vehicles"] }}
      onPatch={onPatch}
    />,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "All Canada" }));
  fireEvent.click(await screen.findByRole("button", { name: /Ontario/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Greater Toronto" }));
  expect(
    screen.getByRole("heading", { name: "3. Neighbourhood" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Scarborough" }));
  expect(
    screen
      .getByRole("checkbox", { name: "All of Greater Toronto" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: /Done/ }));
  expect(onPatch).toHaveBeenLastCalledWith({
    province: "on",
    cities: ["scar"],
  });
});

test("FilterSheet uses live hierarchy and location choices preserve category filters", async () => {
  const apply = vi.fn();
  render(
    <FilterSheet
      open
      initialGroup="location"
      filters={{ ...DEFAULT_FILTERS, categories: ["Vehicles"] }}
      onApply={apply}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("radio", { name: "Ontario" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Greater Toronto" }));
  expect(
    screen.getByRole("heading", { name: "3. Neighbourhood" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Scarborough" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      province: "on",
      cities: ["scar"],
      categories: ["Vehicles"],
    }),
  );
});

test("empty region still opens the third step and can be selected as a whole", async () => {
  const empty = {
    provinces: [
      {
        id: "on",
        label: "Ontario",
        areas: [{ id: "ottawa", label: "Ottawa", neighbourhoods: [] }],
      },
    ],
  };
  function Harness() {
    const [filters, setFilters] = useState({
      ...DEFAULT_FILTERS,
      province: "on",
    });
    return (
      <LocationHierarchy
        catalog={empty}
        filters={filters}
        onChange={setFilters}
      />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Ottawa" }));
  expect(
    screen.getByRole("heading", { name: "3. Neighbourhood" }),
  ).toBeTruthy();
  expect(screen.getByText(/No neighbourhoods have been added/)).toBeTruthy();
  expect(
    screen
      .getByRole("checkbox", { name: "All of Ottawa" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Back to regions" }));
  expect(
    screen
      .getByRole("checkbox", { name: "Ottawa" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

test("reopening an applied neighbourhood shows the third step and choosing the whole region replaces it", () => {
  function Harness() {
    const [filters, setFilters] = useState({
      ...DEFAULT_FILTERS,
      province: "on",
      cities: ["scar"],
    });
    return (
      <LocationHierarchy
        catalog={catalog}
        filters={filters}
        onChange={setFilters}
      />
    );
  }
  render(<Harness />);
  expect(
    screen
      .getByRole("checkbox", { name: "Scarborough" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "All of Greater Toronto" }),
  );
  expect(
    screen
      .getByRole("checkbox", { name: "Scarborough" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    screen
      .getByRole("checkbox", { name: "All of Greater Toronto" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

test("changing province clears the old neighbourhood and returns to region selection", async () => {
  const apply = vi.fn();
  render(
    <FilterSheet
      open
      initialGroup="location"
      filters={{ ...DEFAULT_FILTERS, province: "on", cities: ["scar"] }}
      onApply={apply}
      onClose={vi.fn()}
    />,
  );
  await screen.findByRole("checkbox", { name: "Scarborough" });
  fireEvent.click(screen.getByRole("button", { name: "Change province" }));
  fireEvent.click(screen.getByRole("radio", { name: "Custom Province" }));
  expect(screen.queryByRole("checkbox", { name: "Scarborough" })).toBeNull();
  expect(
    screen.getByRole("heading", { name: "2. Region / city" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({ province: "custom", cities: [] }),
  );
});

test("catalog error has retry without invented province choices", async () => {
  getLocations
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(catalog);
  render(<LocationBar filters={DEFAULT_FILTERS} onPatch={vi.fn()} />);
  await act(async () => {});
  getLocations.mockRejectedValueOnce(new Error("Offline"));
  fireEvent.click(screen.getByRole("button", { name: "All Canada" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: /Ontario/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry locations" }));
  expect(
    await screen.findByRole("button", { name: /Custom Province/ }),
  ).toBeTruthy();
});
