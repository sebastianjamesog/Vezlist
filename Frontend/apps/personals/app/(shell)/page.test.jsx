import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Personals from "./page";
import { DEFAULT_FILTERS } from "@vezlist/shared/lib/filters.js";

let status;
vi.mock("@vezlist/shared/context/StatusContext.jsx", () => ({
  useStatus: () => status,
}));
vi.mock("@vezlist/shared/context/FeedContext.jsx", () => ({
  useFeed: () => ({
    filters: DEFAULT_FILTERS,
    setFilters: vi.fn(),
    query: "",
    setQuery: vi.fn(),
    locations: null,
  }),
}));
vi.mock("../useDiscreet", () => ({ useDiscreet: () => [false, vi.fn()] }));
vi.mock("../useShortcutPreviews.js", () => ({ default: () => ({}) }));
vi.mock("@vezlist/shared/lib/api/discovery.js", () => ({
  searchListings: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("@vezlist/shared/lib/api/live.js", () => ({
  listLiveCreators: vi.fn().mockResolvedValue({ total: 0 }),
}));
vi.mock("@vezlist/shared/components/LocationBar.jsx", () => ({
  default: () => null,
}));
vi.mock("@vezlist/shared/components/FilterSheet.jsx", () => ({
  default: () => null,
}));
vi.mock("@vezlist/shared/components/FilterButton.jsx", () => ({
  default: () => null,
}));
vi.mock("@vezlist/shared/components/PersonalsPicker.jsx", () => ({
  default: () => null,
}));
vi.mock("@vezlist/shared/components/FeedRails.jsx", () => ({
  Shortcuts: () => null,
}));
vi.mock("@vezlist/shared/components/cards/ListingCard.jsx", () => ({
  default: () => null,
}));
vi.mock("@vezlist/shared/components/media/MediaImage.jsx", () => ({
  default: ({ alt }) => <span role="img" aria-label={alt} />,
}));

const mine = {
  id: "me",
  own: true,
  name: "Current Creator",
  avatar: null,
  msAgo: 0,
  updates: [{ id: "published-own" }],
};
const unseen = {
  id: "other-1",
  own: false,
  name: "Other Creator",
  avatar: null,
  msAgo: 1000,
  updates: [{ id: "published-other" }],
};
const viewed = { ...unseen, id: "other-2", name: "Viewed Creator" };

describe("home published story rail", () => {
  beforeEach(() => {
    status = { stories: [mine], seen: [] };
  });

  test("an own-only published story appears on home and opens My Stories", async () => {
    render(<Personals />);
    await screen.findByText("No posts match your filters");
    expect(screen.getByRole("heading", { name: "Stories" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Your story/ }).getAttribute("href"),
    ).toBe("/status/me");
    expect(screen.queryByText(/1 new/)).toBeNull();
  });

  test("own story comes first without changing other ordering or new count", async () => {
    status = { stories: [viewed, mine, unseen], seen: [viewed.id] };
    render(<Personals />);
    await screen.findByText("No posts match your filters");
    expect(
      screen.getByRole("heading", { name: /Stories.*1 new/ }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/status/me", "/status/other-1", "/status/other-2"]);
  });

  test("draft-only and empty own accounts do not create an active story bubble", async () => {
    status = {
      stories: [{ ...mine, updates: [] }],
      seen: [],
      drafts: [{ id: "draft-1", status: "READY" }],
    };
    render(<Personals />);
    await screen.findByText("No posts match your filters");
    expect(screen.queryByRole("heading", { name: /Stories/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Your story/ })).toBeNull();
  });

  test("other creators remain visible when there is no active own story", async () => {
    status = { stories: [{ ...mine, updates: [] }, unseen], seen: [] };
    render(<Personals />);
    await screen.findByText("No posts match your filters");
    expect(screen.queryByRole("link", { name: /Your story/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: /Other Creator/ }).getAttribute("href"),
    ).toBe("/status/other-1");
  });
});
