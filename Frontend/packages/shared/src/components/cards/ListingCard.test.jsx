import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ListingCard from "./ListingCard.jsx";

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

test("uses the compact row with a thumbnail beside the ad details", () => {
  render(<ListingCard listing={listing} chevron />);

  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/ad/ad-123");
  const image = screen.getByRole("img", { name: listing.title });
  expect(image.parentElement.className).toContain("size-[104px]");
  expect(screen.getByRole("heading", { name: listing.title })).toBeTruthy();
  const details = screen.getByRole("heading", { name: listing.title }).parentElement;
  expect(details.contains(screen.getByText("Vehicles"))).toBe(true);
  expect(details.contains(screen.getByText("Toronto"))).toBe(true);
  expect(details.contains(screen.getByLabelText("1.9K views"))).toBe(true);
  expect(link.className).toContain("flex");
});

test("ads without media show an honest photo placeholder", () => {
  render(<ListingCard listing={{ ...listing, image: null }} />);
  expect(screen.getByText("No photo yet")).toBeTruthy();
});

test("shows an unavailable view count without inventing a number", () => {
  render(<ListingCard listing={{ ...listing, views: undefined }} />);
  expect(screen.getByLabelText("View count unavailable")).toBeTruthy();
});

test("popup behavior is opt-in and modified clicks retain the normal ad link", () => {
  const open = vi.fn();
  render(<ListingCard listing={listing} onOpen={open} />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/ad/ad-123");
  fireEvent.click(link, { button: 0, ctrlKey: true });
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(link, { button: 0 });
  expect(open).toHaveBeenCalledWith("ad-123");
});
