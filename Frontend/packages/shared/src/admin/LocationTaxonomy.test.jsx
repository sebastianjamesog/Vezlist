import { beforeEach, expect, test, vi } from "vitest";
import { renderAdmin, screen, userEvent, waitFor, within } from "../../../../testing/render.jsx";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import Taxonomy from "./Taxonomy.jsx";
import * as catalog from "../lib/api/adminCatalog.js";
import * as auth from "../lib/api/auth.js";

vi.mock("../lib/api/auth.js", () => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock("../lib/api/adminCatalog.js", () => ({ listLocations: vi.fn(), createProvince: vi.fn(), createArea: vi.fn(), createNeighbourhood: vi.fn(), updateLocation: vi.fn(), deleteArea: vi.fn() }));
const row = (id, label, type, parentId = null) => ({ id, label, type, parentId, displayOrder: 0, popular: false, enabled: true });
const locations = [
  row("on", "Ontario", "PROVINCE"), row("bc", "British Columbia", "PROVINCE"),
  row("gta", "Greater Toronto", "AREA", "on"), row("ottawa", "Ottawa", "AREA", "on"),
  row("scarborough", "Scarborough", "NEIGHBOURHOOD", "gta"), row("kanata", "Kanata", "NEIGHBOURHOOD", "ottawa"),
];
beforeEach(() => {
  vi.resetAllMocks();
  setRoute({ path: "/taxonomy", query: "tab=areas&site=personals" });
  auth.me.mockResolvedValue({ id: "admin", name: "Admin", roles: ["ADMIN"] });
  catalog.listLocations.mockResolvedValue(locations);
});

test("each selector shows only the selected parent's children and resets descendants", async () => {
  const user = userEvent.setup();
  renderAdmin(<Taxonomy />);
  const province = await screen.findByRole("combobox", { name: "Province" });
  const area = screen.getByRole("combobox", { name: "Region / city" });
  const neighbourhood = screen.getByRole("combobox", { name: "Neighbourhood" });
  expect(province.value).toBe("on");
  expect(area.value).toBe("gta");
  expect(neighbourhood.value).toBe("scarborough");
  expect(within(neighbourhood).queryByRole("option", { name: "Kanata" })).toBeNull();
  await user.selectOptions(area, "ottawa");
  expect(neighbourhood.value).toBe("kanata");
  expect(within(neighbourhood).queryByRole("option", { name: "Scarborough" })).toBeNull();
  await user.selectOptions(province, "bc");
  expect(area.value).toBe("");
  expect(neighbourhood.value).toBe("");
  expect(screen.getByRole("button", { name: "Add neighbourhood" }).disabled).toBe(true);
});

test("adding a neighbourhood uses the selected region and selects the saved result", async () => {
  const user = userEvent.setup();
  catalog.createNeighbourhood.mockResolvedValue(row("north-york", "North York", "NEIGHBOURHOOD", "gta"));
  renderAdmin(<Taxonomy />);
  await screen.findByRole("combobox", { name: "Province" });
  await user.click(screen.getByRole("button", { name: "Add neighbourhood" }));
  const dialog = screen.getByRole("dialog", { name: "Add neighbourhood" });
  expect(within(dialog).getByText("Under Greater Toronto")).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Save" }).disabled).toBe(true);
  await user.type(within(dialog).getByRole("textbox", { name: "Location name" }), "  North York  ");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Neighbourhood" }).value).toBe("north-york"));
  expect(catalog.createNeighbourhood).toHaveBeenCalledWith({ label: "North York", areaId: "gta", displayOrder: 1, popular: false });
});

test("new regions use the selected province and start with an empty neighbourhood list", async () => {
  const user = userEvent.setup();
  catalog.createArea.mockResolvedValue(row("hamilton", "Hamilton", "AREA", "on"));
  renderAdmin(<Taxonomy />);
  await screen.findByRole("combobox", { name: "Province" });
  await user.click(screen.getByRole("button", { name: "Add region / city" }));
  const dialog = screen.getByRole("dialog", { name: "Add region / city" });
  await user.type(within(dialog).getByRole("textbox"), "Hamilton");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Region / city" }).value).toBe("hamilton"));
  expect(catalog.createArea).toHaveBeenCalledWith({ label: "Hamilton", provinceId: "on", displayOrder: 1, popular: false });
  expect(screen.getByRole("combobox", { name: "Neighbourhood" }).value).toBe("");
});

test("editing preserves location identity and sends enabled state without moving its parent", async () => {
  const user = userEvent.setup();
  catalog.updateLocation.mockResolvedValue({ ...locations[4], label: "Scarborough Centre", enabled: false });
  renderAdmin(<Taxonomy />);
  await screen.findByRole("combobox", { name: "Province" });
  await user.click(screen.getByRole("button", { name: "Edit Scarborough" }));
  const dialog = screen.getByRole("dialog", { name: "Edit location" });
  await user.clear(within(dialog).getByRole("textbox"));
  await user.type(within(dialog).getByRole("textbox"), "Scarborough Centre");
  await user.click(within(dialog).getByRole("checkbox", { name: "Enabled" }));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("option", { name: "Scarborough Centre (disabled)" })).toBeTruthy();
  expect(catalog.updateLocation).toHaveBeenCalledWith("scarborough", { label: "Scarborough Centre", displayOrder: 0, popular: false, enabled: false });
  expect(screen.getByRole("combobox", { name: "Neighbourhood" }).value).toBe("scarborough");
});

test("in-use deletion remains visible with the server reason; unreferenced deletion updates selectors", async () => {
  const user = userEvent.setup();
  catalog.deleteArea.mockRejectedValueOnce(new Error("Existing ads use this location.")).mockResolvedValue(null);
  renderAdmin(<Taxonomy />);
  await screen.findByRole("combobox", { name: "Province" });
  await user.click(screen.getByRole("button", { name: "Delete Scarborough" }));
  const dialog = screen.getByRole("dialog", { name: "Delete Scarborough?" });
  expect(catalog.deleteArea).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Delete", exact: true }));
  expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "Existing ads use this location.");
  expect(screen.getByRole("combobox", { name: "Neighbourhood" }).value).toBe("scarborough");
  await user.click(within(dialog).getByRole("button", { name: "Delete", exact: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("combobox", { name: "Neighbourhood" }).value).toBe("");
});

test("moderators can browse all levels but cannot mutate them", async () => {
  auth.me.mockResolvedValue({ id: "mod", name: "Moderator", roles: ["MODERATOR"] });
  renderAdmin(<Taxonomy />);
  await screen.findByRole("combobox", { name: "Neighbourhood" });
  expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
});

test("a failed initial load can retry", async () => {
  catalog.listLocations.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(locations);
  renderAdmin(<Taxonomy />);
  await screen.findByText("Couldn't load areas");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("combobox", { name: "Neighbourhood" })).toBeTruthy();
});
