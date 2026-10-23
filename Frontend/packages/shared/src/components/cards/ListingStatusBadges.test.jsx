import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ListingStatusBadges from "./ListingStatusBadges.jsx";
afterEach(() => vi.useRealTimers());

test("status labels expire without a page refresh", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  render(<ListingStatusBadges listing={{ publishedAt: "2026-10-22T12:01:00Z", availableNow: true, availableUntil: "2026-10-23T12:02:00Z" }} />);
  expect(screen.getByText("NEW")).toBeTruthy();
  expect(screen.getByText("Available now")).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_100));
  expect(screen.queryByText("NEW")).toBeNull();
  expect(screen.getByText("Available now")).toBeTruthy();
  act(() => vi.advanceTimersByTime(60_100));
  expect(screen.queryByText("Available now")).toBeNull();
});

test("expired and undated availability flags do not claim availability", () => {
  const { rerender } = render(<ListingStatusBadges listing={{ availableNow: true }} />);
  expect(screen.queryByText("Available now")).toBeNull();
  rerender(<ListingStatusBadges listing={{ availableNow: true, availableUntil: "2000-01-01T00:00:00Z" }} />);
  expect(screen.queryByText("Available now")).toBeNull();
});
