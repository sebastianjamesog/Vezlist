import { beforeEach, expect, test, vi } from "vitest";
import { renderAdmin, screen, userEvent, waitFor, within } from "../../../../testing/render.jsx";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import Taxonomy from "./Taxonomy.jsx";
import * as catalog from "../lib/api/adminCatalog.js";
import * as auth from "../lib/api/auth.js";

vi.mock("../lib/api/auth.js", () => ({ me: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock("../lib/api/adminCatalog.js", () => ({
  listCategories: vi.fn(), listLocations: vi.fn(), listEthnicities: vi.fn(), createEthnicity: vi.fn(), deleteEthnicity: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  setRoute({ path: "/taxonomy", query: "site=personals&tab=ethnicities" });
  auth.me.mockResolvedValue({ id: "admin", name: "Admin", roles: ["ADMIN"] });
  catalog.listEthnicities.mockResolvedValue([{ id: "e1", label: "Asian" }]);
  catalog.listCategories.mockResolvedValue([]);
});

test("admin can add an ethnicity and remove it only after confirmation", async () => {
  const user = userEvent.setup();
  catalog.createEthnicity.mockResolvedValue({ id: "e2", label: "New option" });
  catalog.deleteEthnicity.mockResolvedValue(null);
  renderAdmin(<Taxonomy />);
  await screen.findByText("Asian");
  await user.click(screen.getByRole("button", { name: "Add ethnicity" }));
  const add = screen.getByRole("dialog", { name: "Add ethnicity" });
  expect(within(add).getByRole("button", { name: "Add", exact: true }).disabled).toBe(true);
  await user.type(within(add).getByRole("textbox", { name: /^Ethnicity name/ }), "  New option  ");
  await user.click(within(add).getByRole("button", { name: "Add", exact: true }));
  expect(await screen.findByText("New option")).toBeTruthy();
  expect(catalog.createEthnicity).toHaveBeenCalledWith("New option");
  await user.click(screen.getByRole("button", { name: "Delete New option" }));
  const remove = screen.getByRole("dialog", { name: "Remove ethnicity" });
  expect(within(remove).getByText(/Existing ads keep their saved ethnicity/)).toBeTruthy();
  expect(catalog.deleteEthnicity).not.toHaveBeenCalled();
  await user.click(within(remove).getByRole("button", { name: "Remove", exact: true }));
  await waitFor(() => expect(screen.queryByText("New option")).toBeNull());
  expect(catalog.deleteEthnicity).toHaveBeenCalledWith("e2");
  expect(screen.getByText("Asian")).toBeTruthy();
});

test("duplicate creation stays in the dialog with its actionable server error", async () => {
  const user = userEvent.setup();
  catalog.createEthnicity.mockRejectedValue(new Error("This ethnicity already exists."));
  renderAdmin(<Taxonomy />);
  await screen.findByText("Asian");
  await user.click(screen.getByRole("button", { name: "Add ethnicity" }));
  const dialog = screen.getByRole("dialog", { name: "Add ethnicity" });
  await user.type(within(dialog).getByRole("textbox"), "Asian");
  await user.click(within(dialog).getByRole("button", { name: "Add", exact: true }));
  expect(await within(dialog).findByRole("alert")).toHaveProperty("textContent", "This ethnicity already exists.");
  expect(within(dialog).getByRole("textbox").value).toBe("Asian");
});

test("a failed delete retains the option and allows retry", async () => {
  const user = userEvent.setup();
  catalog.deleteEthnicity.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValue(null);
  renderAdmin(<Taxonomy />);
  await screen.findByText("Asian");
  await user.click(screen.getByRole("button", { name: "Delete Asian" }));
  const dialog = screen.getByRole("dialog", { name: "Remove ethnicity" });
  await user.click(within(dialog).getByRole("button", { name: "Remove", exact: true }));
  expect(await within(dialog).findByText("Connection lost")).toBeTruthy();
  expect(screen.getByText("Asian")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Remove", exact: true }));
  expect(await screen.findByText("No ethnicity options yet.")).toBeTruthy();
});

test("moderators can read the options but cannot add or delete", async () => {
  auth.me.mockResolvedValue({ id: "mod", name: "Moderator", roles: ["MODERATOR"] });
  renderAdmin(<Taxonomy />);
  await screen.findByText("Asian");
  expect(screen.queryByRole("button", { name: "Add ethnicity" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete Asian" })).toBeNull();
});

test("Marketplace taxonomy does not show the Personals ethnicity controls", async () => {
  setRoute({ path: "/taxonomy", query: "site=marketplace&tab=ethnicities" });
  renderAdmin(<Taxonomy />);
  await screen.findByText("No categories for this site yet.");
  expect(screen.queryByText("Ethnicities")).toBeNull();
  expect(catalog.listEthnicities).not.toHaveBeenCalled();
});

test("failed catalog load has a working retry", async () => {
  catalog.listEthnicities.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue([{ id: "e1", label: "Asian" }]);
  renderAdmin(<Taxonomy />);
  await screen.findByText("Couldn't load ethnicities");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Asian")).toBeTruthy();
});
