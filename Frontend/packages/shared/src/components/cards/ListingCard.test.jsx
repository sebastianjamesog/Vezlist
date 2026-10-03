import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import ListingCard from "./ListingCard.jsx";

const state = vi.hoisted(() => ({ signedIn: true, toggle: vi.fn(), toast: vi.fn() }));
vi.mock("../../context/AuthContext.jsx", () => ({ useAuth: () => ({ signedIn: state.signedIn }) }));
vi.mock("../../context/SavedContext.jsx", () => ({
  useSaved: () => ({ isSaved: () => false, toggle: state.toggle }),
}));
vi.mock("../../context/ToastContext.jsx", () => ({ useToast: () => state.toast }));
vi.mock("../media/MediaImage.jsx", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));
vi.mock("../media/PhotoMark.jsx", () => ({ default: () => null }));

const listing = {
  id: "ad-123",
  title: "Well-kept bicycle",
  business: "Alex",
  category: "Vehicles",
  location: "Toronto",
  price: 425,
  views: 1900,
  verified: true,
  image: "https://example.test/bicycle.jpg",
  postedMsAgo: 3_600_000,
};

beforeEach(() => {
  state.signedIn = true;
  state.toggle.mockReset().mockResolvedValue(undefined);
  state.toast.mockReset();
});

test("uses the compact row with a thumbnail beside the ad details", () => {
  render(<ListingCard listing={listing} chevron />);

  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/ad/ad-123");
  const image = screen.getByRole("img", { name: listing.title });
  expect(image.parentElement.className).toContain("size-[104px]");
  expect(screen.getByRole("heading", { name: listing.title })).toBeTruthy();
  const details = screen.getByText("$425").parentElement;
  expect(details.contains(screen.getByText("Vehicles"))).toBe(true);
  expect(details.contains(screen.getByText("Toronto"))).toBe(true);
  expect(details.contains(screen.getByLabelText("1.9K views"))).toBe(true);
  expect(link.className).toContain("flex");
});

test("the thumbnail save control is separate from the ad link", async () => {
  const user = userEvent.setup();
  render(<ListingCard listing={listing} />);

  const button = screen.getByRole("button", { name: "Save this ad" });
  expect(screen.getByRole("link").contains(button)).toBe(false);
  await user.click(button);
  expect(state.toggle).toHaveBeenCalledWith("ad-123");
});

test("ads without media show an honest photo placeholder", () => {
  render(<ListingCard listing={{ ...listing, image: null }} />);
  expect(screen.getByText("No photo yet")).toBeTruthy();
});

test("shows an unavailable view count without inventing a number", () => {
  render(<ListingCard listing={{ ...listing, views: undefined }} />);
  expect(screen.getByLabelText("View count unavailable")).toBeTruthy();
});
