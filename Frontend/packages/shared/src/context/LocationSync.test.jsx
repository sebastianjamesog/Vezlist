import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import LocationSync from "./LocationSync.jsx";

const state = vi.hoisted(() => ({
  filters: { province: "all", cities: [] },
  setFilters: vi.fn(),
}));

vi.mock("./FeedContext", () => ({ useFeed: () => state }));

afterEach(() => {
  document.cookie = "vezlist_location=; max-age=0; path=/";
  state.setFilters.mockClear();
});

test("restores a saved province without crashing during hydration", async () => {
  document.cookie = `vezlist_location=${encodeURIComponent(JSON.stringify({ province: "on", cities: [], source: "manual" }))}; path=/`;

  render(<LocationSync />);

  await waitFor(() => expect(state.setFilters).toHaveBeenCalledOnce());
  expect(state.setFilters.mock.calls[0][0](state.filters)).toMatchObject({
    province: "on",
    cities: [],
  });
});

test("ignores an old automatically chosen province", async () => {
  document.cookie = `vezlist_location=${encodeURIComponent(JSON.stringify({ province: "on", cities: [] }))}; path=/`;
  render(<LocationSync />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(state.setFilters).not.toHaveBeenCalled();
});
