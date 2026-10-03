import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PERSONALS_URL } from "@vezlist/shared/lib/sites.js";
import CategoryGrid from "./CategoryGrid.jsx";

const categories = [
  ["jobs", "Jobs", "Briefcase", true],
  ["services", "Services", "Wrench", true],
  ["fashion", "Fashion & Clothing", "Shirt", false],
  ["vehicles", "Vehicles", "Car", true],
  ["entertainment", "Entertainment", "Clapperboard", false],
  ["property", "Property", "Building2", false],
  ["electronics", "Electronics", "Monitor", true],
  ["buy-sell", "Buy/Sell", "Tag", true],
].map(([id, label, icon, primary]) => ({ id, label, icon, primary }));

vi.mock("@vezlist/shared/context/FeedContext.jsx", () => ({
  useFeed: () => ({ categories, taxonomyReady: true, taxonomyError: null }),
}));

test("shows the nine pictured categories in order and links to real browse routes", () => {
  render(<CategoryGrid />);

  const links = within(screen.getByRole("navigation", { name: "Browse categories" })).getAllByRole("link");
  expect(links.map((link) => link.textContent.trim())).toEqual([
    "Vehicles", "18+Personals", "Buy/Sell", "Property", "Services",
    "Electronics", "Entertainment", "Jobs", "Fashion & Clothing",
  ]);
  expect(links[0].getAttribute("href")).toBe("/browse?cat=vehicles");
  expect(links[1].getAttribute("href")).toBe(PERSONALS_URL);
  expect(links[3].getAttribute("href")).toBe("/browse?cat=property");
});
