import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import PersonalsPicker from "./PersonalsPicker.jsx";
import { DEFAULT_FILTERS } from "../lib/filters.js";
import { getEthnicities } from "../lib/api/catalog.js";
vi.mock("../lib/api/catalog.js", () => ({ getEthnicities: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

test("picker uses fresh server choices on reopening and preserves applied retired values until cleared", async () => {
  getEthnicities
    .mockResolvedValueOnce([{ id: "one", label: "First choice" }])
    .mockResolvedValue([{ id: "two", label: "Second choice" }]);
  const onApply = vi.fn();
  const filters = { ...DEFAULT_FILTERS, ethnicities: ["Retired value"] };
  const props = { filters, onApply, onClose: vi.fn(), initialTab: "ethnicity" };
  const view = render(<PersonalsPicker {...props} open />);
  await screen.findByRole("button", { name: "First choice" });
  expect(
    screen
      .getByRole("button", { name: "Retired value" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  view.rerender(<PersonalsPicker {...props} open={false} />);
  view.rerender(<PersonalsPicker {...props} open />);
  await screen.findByRole("button", { name: "Second choice" });
  expect(screen.queryByRole("button", { name: "First choice" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retired value" }));
  expect(screen.queryByRole("button", { name: "Retired value" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Second choice" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ ethnicities: ["Second choice"] }),
  );
});

test("picker does not fetch while closed and recovers an error using Retry", async () => {
  getEthnicities
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue([]);
  const props = {
    filters: DEFAULT_FILTERS,
    onApply: vi.fn(),
    onClose: vi.fn(),
    initialTab: "ethnicity",
  };
  const view = render(<PersonalsPicker {...props} open={false} />);
  expect(getEthnicities).not.toHaveBeenCalled();
  view.rerender(<PersonalsPicker {...props} open />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("button", { name: "Asian" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry ethnicities" }));
  await screen.findByText("No ethnicity choices are available.");
  expect(screen.queryByRole("alert")).toBeNull();
});
