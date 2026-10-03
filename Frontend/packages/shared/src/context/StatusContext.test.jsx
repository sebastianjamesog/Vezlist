import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { StatusProvider, useStatus } from "./StatusContext";
import * as api from "../lib/api/stories";

const session = vi.hoisted(() => ({
  user: { id: "owner", name: "Owner", accountType: "CREATOR" },
  ready: true,
}));
vi.mock("./AuthContext", () => ({ useAuth: () => session }));
vi.mock("../lib/sites", () => ({ IS_PERSONALS: true }));
vi.mock("../lib/api/stories", () => ({
  listStories: vi.fn(),
  listMyStories: vi.fn(),
  listCreatorStories: vi.fn(),
  deleteStory: vi.fn(),
}));
const row = (id, fields = {}) => ({
  id,
  ownerId: "someone",
  creatorName: "Creator",
  status: "PUBLISHED",
  mediaType: "IMAGE",
  mediaUrl: `https://media.example/${id}.jpg`,
  publishedAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  ...fields,
});
const mount = () => renderHook(() => useStatus(), { wrapper: StatusProvider });
beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: "owner", name: "Owner", accountType: "CREATOR" };
  api.listStories.mockResolvedValue({ items: [] });
  api.listMyStories.mockResolvedValue({ items: [], credits: 0 });
});

test("uses server media and filters drafts, expired stories and legacy fixtures", async () => {
  localStorage.setItem(
    "vezlist:my-story:v1",
    JSON.stringify({ updates: [{ id: "legacy" }] }),
  );
  api.listStories.mockResolvedValue({
    items: [
      row("image"),
      row("video", { mediaType: "VIDEO" }),
      row("expired", { expiresAt: new Date(Date.now() - 1).toISOString() }),
    ],
  });
  api.listMyStories.mockResolvedValue({
    items: [
      row("draft", { ownerId: "owner", status: "READY" }),
      row("own", { ownerId: "owner" }),
    ],
    credits: 2,
  });
  const { result } = mount();
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(
    result.current.stories
      .flatMap((story) => story.updates.map((update) => update.id))
      .sort(),
  ).toEqual(["image", "own", "video"]);
  expect(
    result.current.stories
      .find((story) => story.id === "someone")
      .updates.find((update) => update.id === "video").video,
  ).toContain("video.jpg");
  expect(result.current.myUpdates.map((update) => update.id)).toEqual(["own"]);
  expect(result.current.credits).toBe(2);
});

test("expires stories while offline without another request", async () => {
  vi.useFakeTimers();
  try {
    api.listStories.mockResolvedValue({
      items: [
        row("short", { expiresAt: new Date(Date.now() + 500).toISOString() }),
      ],
    });
    const { result } = mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      result.current.stories.flatMap((story) => story.updates),
    ).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(
      result.current.stories.flatMap((story) => story.updates),
    ).toHaveLength(0);
    expect(api.listStories).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test("loads direct creators and only deletes after server confirmation", async () => {
  api.listCreatorStories.mockResolvedValue({ items: [row("direct")] });
  const { result } = mount();
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => {
    await result.current.loadCreatorStories("someone");
  });
  expect(
    result.current.stories.find((story) => story.id === "someone").updates,
  ).toHaveLength(1);
  api.deleteStory.mockRejectedValueOnce(new Error("Cannot delete"));
  await act(async () => {
    await expect(result.current.removeStory("direct")).rejects.toThrow(
      "Cannot delete",
    );
  });
  expect(
    result.current.stories.find((story) => story.id === "someone").updates,
  ).toHaveLength(1);
  api.deleteStory.mockResolvedValueOnce(undefined);
  await act(async () => {
    await result.current.removeStory("direct");
  });
  expect(result.current.stories.some((story) => story.id === "someone")).toBe(
    false,
  );
});

test("does not carry private credits into another account during loading", async () => {
  api.listMyStories.mockResolvedValue({
    items: [row("own", { ownerId: "owner" })],
    credits: 3,
  });
  const { result, rerender } = mount();
  await waitFor(() => expect(result.current.credits).toBe(3));
  api.listMyStories.mockReturnValue(new Promise(() => {}));
  session.user = { id: "next", name: "Next", accountType: "CREATOR" };
  rerender();
  expect(result.current.credits).toBe(0);
  expect(result.current.myUpdates).toHaveLength(0);
  expect(result.current.myStoryReady).toBe(false);
});

test("reports failures and recovers on refresh", async () => {
  api.listStories.mockRejectedValueOnce(new Error("Network unavailable"));
  const { result } = mount();
  await waitFor(() => expect(result.current.error).toBe("Network unavailable"));
  await act(async () => {
    await result.current.refreshStories();
  });
  expect(result.current.error).toBe(null);
});

test("browsing accounts load public stories without requesting creator-only drafts", async () => {
  session.user = { id: "owner", name: "Owner", accountType: "BROWSING" };
  api.listStories.mockResolvedValue({ items: [row("public")] });
  const { result } = mount();
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(api.listMyStories).not.toHaveBeenCalled();
  expect(result.current.error).toBe(null);
  expect(result.current.canManage).toBe(false);
});
