import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import CreatorDashboard from "./CreatorDashboard";
import { ownedListings } from "../lib/api/listings";
vi.mock("../lib/api/listings", () => ({ ownedListings: vi.fn() }));
vi.mock("../components/layout/AppLayout", () => ({ useShell: () => ({ openPost: vi.fn() }) }));
vi.mock("../components/layout/SubPageBar", () => ({ default: () => null }));
vi.mock("../components/media/MediaImage.jsx", () => ({ default: () => null }));

test("Total views sums real owned-ad views, including inactive ads", async () => {
  ownedListings.mockResolvedValue([
    { id: "a", title: "First", status: "ACTIVE", viewCount: 25, saveCount: 2 },
    { id: "b", title: "Second", status: "EXPIRED", viewCount: 75, saveCount: 1 },
  ]);
  render(<CreatorDashboard />);
  const views = await screen.findByRole("link", { name: /Total views/ });
  expect(within(views).getByText("100")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Manage all ads" }).getAttribute("href")).toBe("/profile/ads");
});
