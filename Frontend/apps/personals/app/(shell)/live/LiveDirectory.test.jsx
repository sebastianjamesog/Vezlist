import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import LiveDirectory from "./LiveDirectory.jsx";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";

vi.mock("@vezlist/shared/lib/api/live.js", () => ({
  listLiveCreators: vi.fn(),
}));
vi.mock("@vezlist/shared/components/media/MediaImage.jsx", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  listLiveCreators.mockReset().mockResolvedValue({
    total: 1,
    items: [
      {
        id: "session-1",
        status: "LIVE",
        ownerId: "creator-1",
        listingId: "ad-1",
        creatorName: "Sofia",
        title: "Late night vibes",
        location: "Calgary",
        startedAt: new Date().toISOString(),
        imageUrl: "https://example.test/actual-ad-photo.webp",
        avatarUrl: null,
      },
    ],
  });
});

test("uses live directory data and the real ad photo without invented audience metrics", async () => {
  const { container } = render(<LiveDirectory />);
  expect(await screen.findByText("Late night vibes")).toBeTruthy();
  expect(screen.getByText("1 creator online")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /Late night vibes/ }).getAttribute("href"),
  ).toBe("/live/session-1");
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://example.test/actual-ad-photo.webp",
  );
  expect(screen.queryByText(/watching/i)).toBeNull();
});

test("does not label preparing or ended sessions as live cards", async () => {
  listLiveCreators.mockResolvedValue({
    total: 0,
    items: [
      { id: "ended", status: "ENDED", title: "Old session" },
      { id: "preparing", status: "PREPARING", title: "Preparing" },
    ],
  });
  render(<LiveDirectory />);
  expect(await screen.findByText("Nobody is live right now")).toBeTruthy();
  expect(screen.queryByText("Old session")).toBeNull();
  expect(screen.queryByText("Preparing")).toBeNull();
});

function page(overrides = {}) {
  return {
    total: 1,
    items: [
      {
        id: "fresh",
        status: "LIVE",
        creatorName: "Alex",
        title: "New session",
        location: "Toronto",
        startedAt: new Date().toISOString(),
        ...overrides,
      },
    ],
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("matches the portrait grid and shows only real audience counts including zero", async () => {
  listLiveCreators.mockResolvedValue(page({ viewerCount: 0 }));
  render(<LiveDirectory />);
  const card = await screen.findByRole("link", { name: /Alex.*Watch live/ });
  expect(card.className).toContain("aspect-[4/5]");
  expect(card.parentElement.className).toContain("grid-cols-3");
  expect(card.parentElement.className).toContain("lg:grid-cols-4");
  expect(card.parentElement.className).toContain("xl:grid-cols-5");
  expect(screen.getByLabelText("0 watching")).toBeTruthy();
  expect(screen.getByText("Toronto")).toBeTruthy();
});
test("expires a live card at its deadline without another response", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  listLiveCreators.mockResolvedValue(page({ endsAt: "2026-10-24T12:00:02Z" }));
  render(<LiveDirectory />);
  await act(async () => {});
  expect(screen.getByText("New session")).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(2_050);
  });
  expect(screen.queryByText("New session")).toBeNull();
  expect(screen.getByText("Nobody is live right now")).toBeTruthy();
  expect(screen.getByText("0 creators online")).toBeTruthy();
  expect(listLiveCreators).toHaveBeenCalledTimes(1);
});
test("late requests cannot restore an ended stream after focus refresh", async () => {
  const initial = deferred();
  listLiveCreators
    .mockReturnValueOnce(initial.promise)
    .mockResolvedValue({ total: 0, items: [] });
  render(<LiveDirectory />);
  const initialSignal = listLiveCreators.mock.calls[0][1].signal;
  fireEvent.focus(window);
  expect(await screen.findByText("Nobody is live right now")).toBeTruthy();
  expect(initialSignal.aborted).toBe(true);
  await act(async () => {
    initial.resolve(page());
  });
  expect(screen.queryByText("New session")).toBeNull();
});
test("polls and refreshes on visibility return, removing ended streams", async () => {
  vi.useFakeTimers();
  listLiveCreators
    .mockResolvedValueOnce(page())
    .mockResolvedValue({ total: 0, items: [] });
  render(<LiveDirectory />);
  await act(async () => {});
  expect(screen.getByText("New session")).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(15_000);
  });
  expect(screen.queryByText("New session")).toBeNull();
  listLiveCreators.mockResolvedValue(page({ status: "RECONNECTING" }));
  fireEvent(document, new Event("visibilitychange"));
  await act(async () => {});
  expect(screen.getByText("Reconnecting")).toBeTruthy();
  expect(listLiveCreators).toHaveBeenLastCalledWith(
    30,
    expect.objectContaining({ cache: "no-store" }),
  );
});
test("first load failure offers retry without claiming nobody is live", async () => {
  listLiveCreators
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(page());
  render(<LiveDirectory />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Nobody is live right now")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("New session")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
test("aborts pending request and stops polling when leaving directory", async () => {
  vi.useFakeTimers();
  listLiveCreators.mockReturnValue(deferred().promise);
  const view = render(<LiveDirectory />);
  const signal = listLiveCreators.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    vi.advanceTimersByTime(60_000);
  });
  fireEvent.focus(window);
  expect(listLiveCreators).toHaveBeenCalledTimes(1);
});

test("uses server time instead of a fast device clock for expiry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T14:00:00Z"));
  listLiveCreators.mockResolvedValue(
    page({
      serverTime: "2026-10-24T12:00:00Z",
      startedAt: "2026-10-24T11:59:00Z",
      endsAt: "2026-10-24T12:00:02Z",
    }),
  );
  render(<LiveDirectory />);
  await act(async () => {});
  expect(screen.getByText("New session")).toBeTruthy();
  expect(screen.getByText("1 minute ago")).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(2_050);
  });
  expect(screen.queryByText("New session")).toBeNull();
  expect(screen.getByText("0 creators online")).toBeTruthy();
});
