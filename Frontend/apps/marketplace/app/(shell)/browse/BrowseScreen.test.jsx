import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { FeedProvider, useFeed } from "@vezlist/shared/context/FeedContext.jsx";
import { searchListings } from "@vezlist/shared/lib/api/discovery.js";
import BrowseScreen from "./BrowseScreen.jsx";

vi.mock("@vezlist/shared/lib/api/catalog.js", () => ({
  getCategories: async () => [{ id: "vehicles", label: "Vehicles" }],
  getLocations: async () => ({ provinces: [] }),
}));
vi.mock("@vezlist/shared/lib/api/discovery.js", () => ({
  searchListings: vi.fn(),
}));
vi.mock("@vezlist/shared/components/layout/AppLayout.jsx", () => ({
  useShell: () => ({ openPost: vi.fn() }),
}));
vi.mock("@vezlist/shared/context/SearchContext.jsx", () => ({
  useSearch: () => ({ recent: [], saved: [] }),
}));
vi.mock("@vezlist/shared/components/cards/ListingCard.jsx", () => ({
  default: ({ listing }) => <article>{listing.title}</article>,
}));

const listings = [
  { id: "recent", title: "Recent car", verified: false, ageHours: 2 },
  { id: "week", title: "This week's car", verified: false, ageHours: 48 },
  {
    id: "verified",
    title: "Verified older car",
    verified: true,
    ageHours: 240,
  },
];

beforeEach(() => {
  searchListings.mockReset();
  searchListings.mockImplementation(async ({ verifiedOnly, postedWithin }) => ({
    items: listings.filter(
      (item) =>
        (!verifiedOnly || item.verified) &&
        (!postedWithin ||
          item.ageHours < (postedWithin === "HOURS_24" ? 24 : 168)),
    ),
    hasMore: false,
  }));
});

function Preferences() {
  const { setFilters, setQuery } = useFeed();
  useEffect(() => {
    setFilters((current) => ({
      ...current,
      categories: ["Vehicles"],
      province: "on",
    }));
    setQuery("car");
  }, [setFilters, setQuery]);
  return null;
}

test("switches Verified, New Today and Trending without refreshing or retaining the previous shortcut", async () => {
  const user = userEvent.setup();
  render(
    <FeedProvider>
      <Preferences />
      <BrowseScreen />
    </FeedProvider>,
  );
  await screen.findByText("Verified older car");

  const verified = screen.getByRole("button", {
    name: /Verified\s*Checked ads/,
  });
  const today = screen.getByRole("button", { name: /New Today/ });
  const trending = screen.getByRole("button", { name: /Trending\s*This week/ });

  await user.click(verified);
  await screen.findByText("Verified older car");
  expect(screen.queryByText("Recent car")).toBeNull();

  await user.click(today);
  await screen.findByText("Recent car");
  expect(screen.queryByText("Verified older car")).toBeNull();
  expect(screen.queryByText("This week's car")).toBeNull();
  expect(verified.getAttribute("aria-pressed")).toBe("false");
  expect(today.getAttribute("aria-pressed")).toBe("true");

  await user.click(trending);
  await screen.findByText("This week's car");
  expect(screen.queryByText("Verified older car")).toBeNull();
  expect(today.getAttribute("aria-pressed")).toBe("false");

  await user.click(verified);
  await screen.findByText("Verified older car");
  expect(screen.queryByText("This week's car")).toBeNull();
  expect(trending.getAttribute("aria-pressed")).toBe("false");
  await waitFor(() =>
    expect(searchListings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: "car",
        category: ["vehicles"],
        province: "on",
        verifiedOnly: true,
        postedWithin: undefined,
      }),
    ),
  );
});

test("shows the genuine empty state when there are no verified ads", async () => {
  searchListings.mockImplementation(async ({ verifiedOnly }) => ({
    items: verifiedOnly ? [] : [listings[0]],
    hasMore: false,
  }));
  const user = userEvent.setup();
  render(
    <FeedProvider>
      <BrowseScreen />
    </FeedProvider>,
  );
  await screen.findByText("Recent car");
  await user.click(
    screen.getByRole("button", { name: /Verified\s*Checked ads/ }),
  );
  await screen.findByText("No ads match your filters");
  await user.click(screen.getByRole("button", { name: /New Today/ }));
  await screen.findByText("Recent car");
});
