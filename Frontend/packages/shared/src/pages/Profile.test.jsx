import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Profile from "./Profile.jsx";
import { getProfile } from "../lib/api/users";
import { ownedListingSummary } from "../lib/api/listings";
import { listSavedListings } from "../lib/api/saved";

const state = vi.hoisted(() => ({
  user: { id: "owner-1", name: "Session Name" },
  creator: true,
  site: "MARKETPLACE",
  openPost: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: state.user,
    signedIn: Boolean(state.user),
    signOut: vi.fn(),
  }),
}));
vi.mock("../context/AccountContext", () => ({
  useAccount: () => ({
    isCreator: state.creator,
    can: () => state.creator,
    roleMeta: {
      icon: "Megaphone",
      label: state.creator ? "Ads creator" : "Browsing",
    },
  }),
}));
vi.mock("../context/StatusContext", () => ({
  useStatus: () => ({ myUpdates: [], seen: ["local-demo-story"] }),
}));
vi.mock("../context/ToastContext", () => ({ useToast: () => vi.fn() }));
vi.mock("../components/layout/AppLayout", () => ({
  useShell: () => ({ openStory: vi.fn(), openPost: state.openPost }),
}));
vi.mock("../components/layout/TopBar", () => ({ default: () => null }));
vi.mock("../components/media/MediaImage.jsx", () => ({
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));
vi.mock("../lib/api/client", () => ({
  get SITE_SCOPE() {
    return state.site;
  },
}));
vi.mock("../lib/api/users", () => ({ getProfile: vi.fn() }));
vi.mock("../lib/api/listings", () => ({ ownedListingSummary: vi.fn() }));
vi.mock("../lib/api/saved", () => ({ listSavedListings: vi.fn() }));
vi.mock("../lib/api/notifications", () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ count: 0 }),
}));

const profile = (overrides = {}) => ({
  id: "owner-1",
  name: "Backend Name",
  location: "Halifax, NS",
  avatarUrl: "https://media.example.test/profile.jpg",
  emailVerified: true,
  ...overrides,
});
const hero = () => within(screen.getByRole("region", { name: "Your profile" }));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "owner-1", name: "Session Name" };
  state.creator = true;
  state.site = "MARKETPLACE";
  getProfile.mockReset().mockResolvedValue(profile());
  ownedListingSummary.mockReset().mockResolvedValue({ activeAds: 7 });
  // The first page is not the count: it can have one item while 1,501 are saved.
  listSavedListings.mockReset().mockResolvedValue({
    items: [{ id: "one-row" }],
    totalCount: 1501,
    hasMore: true,
    nextCursor: "more",
  });
});

describe("backend-backed profile card", () => {
  test.each(["MARKETPLACE", "PERSONALS"])(
    "uses this account's real identity and %s counts",
    async (site) => {
      state.site = site;
      render(<Profile />);
      await hero().findByRole("heading", { name: "Backend Name" });
      expect(hero().getByText("Halifax, NS")).toBeTruthy();
      expect(
        hero().getByRole("img", { name: "Backend Name" }).getAttribute("src"),
      ).toBe("https://media.example.test/profile.jpg");
      expect(await hero().findByText("7")).toBeTruthy();
      expect(await hero().findByText("1,501")).toBeTruthy();
      expect(ownedListingSummary).toHaveBeenCalledWith(site);
      expect(listSavedListings).toHaveBeenCalledWith({ site, limit: 1 });
      expect(hero().queryByText("Views this week")).toBeNull();
      expect(hero().queryByText("Watched")).toBeNull();
      expect(
        screen
          .getByRole("region", { name: "Your profile" })
          .querySelector(".lucide-badge-check"),
      ).toBeNull();
      expect(screen.getByText("1501 saved ads")).toBeTruthy();
    },
  );

  test("shows loading placeholders instead of demo identity or invented zero counts", () => {
    getProfile.mockReturnValue(new Promise(() => {}));
    ownedListingSummary.mockReturnValue(new Promise(() => {}));
    listSavedListings.mockReturnValue(new Promise(() => {}));
    render(<Profile />);
    expect(hero().getByRole("heading", { name: "Session Name" })).toBeTruthy();
    expect(hero().getByRole("img", { name: "No profile photo" })).toBeTruthy();
    expect(
      hero().getByRole("status", { name: "Loading active ads" }),
    ).toBeTruthy();
    expect(hero().getByRole("status", { name: "Loading saved" })).toBeTruthy();
    for (const demo of ["24", "1,300", "0", "Victoria, BC", "Watched"]) {
      expect(hero().queryByText(demo)).toBeNull();
    }
  });

  test("renders real empty counts and a neutral missing photo/location", async () => {
    getProfile.mockResolvedValue(profile({ avatarUrl: null, location: null }));
    ownedListingSummary.mockResolvedValue({ activeAds: 0 });
    listSavedListings.mockResolvedValue({ items: [], totalCount: 0 });
    render(<Profile />);
    await hero().findByText("Location not set");
    expect(hero().getByRole("img", { name: "No profile photo" })).toBeTruthy();
    await waitFor(() => expect(hero().getAllByText("0")).toHaveLength(2));
    expect(screen.getByText("0 saved ads")).toBeTruthy();
  });

  test("keeps real profile and saved total when the active count fails, and retries only that count", async () => {
    ownedListingSummary.mockRejectedValueOnce(new Error("offline"));
    render(<Profile />);
    expect(await hero().findByText("Halifax, NS")).toBeTruthy();
    expect(await hero().findByText("1,501")).toBeTruthy();
    await userEvent.click(
      await hero().findByRole("button", { name: "Retry active ads" }),
    );
    expect(await hero().findByText("7")).toBeTruthy();
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(listSavedListings).toHaveBeenCalledTimes(1);
    expect(ownedListingSummary).toHaveBeenCalledTimes(2);
  });

  test("profile failure does not hide successful metrics and supports retry", async () => {
    getProfile.mockRejectedValueOnce(new Error("offline"));
    render(<Profile />);
    expect(
      await hero().findByText("Profile details unavailable."),
    ).toBeTruthy();
    expect(await hero().findByText("7")).toBeTruthy();
    expect(hero().getByRole("heading", { name: "Session Name" })).toBeTruthy();
    expect(hero().queryByText("Victoria, BC")).toBeNull();
    await userEvent.click(
      hero().getByRole("button", { name: "Retry profile" }),
    );
    expect(await hero().findByText("Halifax, NS")).toBeTruthy();
    expect(ownedListingSummary).toHaveBeenCalledTimes(1);
  });

  test("saved failures and invalid backend counts never appear as zero", async () => {
    listSavedListings.mockRejectedValueOnce(new Error("offline"));
    ownedListingSummary.mockResolvedValue({ activeAds: "24" });
    render(<Profile />);
    expect(
      await hero().findByRole("button", { name: "Retry saved" }),
    ).toBeTruthy();
    expect(
      await hero().findByRole("button", { name: "Retry active ads" }),
    ).toBeTruthy();
    expect(hero().queryByText("0")).toBeNull();
    expect(hero().queryByText("24")).toBeNull();
    await userEvent.click(hero().getByRole("button", { name: "Retry saved" }));
    expect(await hero().findByText("1,501")).toBeTruthy();
  });

  test("browsing accounts show backend saves without unsupported watched/creator metrics", async () => {
    state.creator = false;
    render(<Profile />);
    expect(await hero().findByText("1,501")).toBeTruthy();
    expect(hero().queryByText("Active ads")).toBeNull();
    expect(hero().queryByText("Watched")).toBeNull();
    expect(ownedListingSummary).not.toHaveBeenCalled();
  });

  test("does not show previous account data while the next account loads", async () => {
    const { rerender } = render(<Profile />);
    await hero().findByText("Halifax, NS");
    const nextProfile = deferred();
    const nextCount = deferred();
    const nextSaved = deferred();
    getProfile.mockReturnValueOnce(nextProfile.promise);
    ownedListingSummary.mockReturnValueOnce(nextCount.promise);
    listSavedListings.mockReturnValueOnce(nextSaved.promise);
    state.user = { id: "owner-2", name: "Second User" };
    rerender(<Profile />);
    expect(hero().queryByText("Halifax, NS")).toBeNull();
    expect(hero().queryByText("Backend Name")).toBeNull();
    expect(hero().queryByText("7")).toBeNull();
    expect(hero().queryByText("1,501")).toBeNull();
    expect(hero().getByRole("heading", { name: "Second User" })).toBeTruthy();
    await act(async () => {
      nextProfile.resolve(
        profile({
          id: "owner-2",
          name: "Second Backend",
          location: "Toronto, ON",
        }),
      );
      nextCount.resolve({ activeAds: 2 });
      nextSaved.resolve({ totalCount: 3, items: [] });
    });
    expect(hero().getByText("Toronto, ON")).toBeTruthy();
    expect(hero().getByText("2")).toBeTruthy();
    expect(hero().getByText("3")).toBeTruthy();
  });

  test("ignores late responses from the account that signed out or changed", async () => {
    const oldProfile = deferred();
    const oldCount = deferred();
    const oldSaved = deferred();
    getProfile.mockReturnValueOnce(oldProfile.promise);
    ownedListingSummary.mockReturnValueOnce(oldCount.promise);
    listSavedListings.mockReturnValueOnce(oldSaved.promise);
    const { rerender } = render(<Profile />);
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(1));
    state.user = { id: "owner-2", name: "Second User" };
    getProfile.mockResolvedValue(
      profile({ id: "owner-2", name: "Second Backend" }),
    );
    ownedListingSummary.mockResolvedValue({ activeAds: 2 });
    listSavedListings.mockResolvedValue({ totalCount: 3, items: [] });
    rerender(<Profile />);
    await hero().findByRole("heading", { name: "Second Backend" });
    await act(async () => {
      oldProfile.resolve(profile({ name: "Stale User", location: "Old City" }));
      oldCount.resolve({ activeAds: 99 });
      oldSaved.resolve({ totalCount: 98, items: [] });
    });
    expect(hero().queryByText("Stale User")).toBeNull();
    expect(hero().queryByText("Old City")).toBeNull();
    expect(hero().queryByText("99")).toBeNull();
    expect(hero().queryByText("98")).toBeNull();
    state.user = null;
    rerender(<Profile />);
    expect(hero().queryByText("Second Backend")).toBeNull();
    expect(hero().queryByText("2")).toBeNull();
    expect(hero().queryByText("3")).toBeNull();
  });
});


test("Post Ad is the first profile action and opens the ad composer", async () => {
  render(<Profile />);
  const nav = screen.getByRole("navigation");
  const first = within(nav).getAllByRole("button")[0];
  expect(first.textContent).toContain("Post Ad");
  await userEvent.click(first);
  expect(state.openPost).toHaveBeenCalledOnce();
});
