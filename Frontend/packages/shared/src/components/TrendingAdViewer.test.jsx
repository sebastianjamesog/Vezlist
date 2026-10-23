import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import TrendingAdViewer from "./TrendingAdViewer.jsx";
import { getListingDetail } from "../lib/api/discovery.js";
import { getSellerProfile } from "../lib/api/sellers.js";
import { recordListingView } from "../lib/api/views.js";

const state = vi.hoisted(() => ({
  saved: new Set(),
  signedIn: true,
  toggle: vi.fn(),
}));
vi.mock("../context/AuthContext.jsx", () => ({
  useAuth: () => ({ signedIn: state.signedIn }),
}));
vi.mock("../context/SavedContext.jsx", () => ({
  useSaved: () => ({
    isSaved: (id) => state.saved.has(id),
    toggle: state.toggle,
  }),
}));
vi.mock("../lib/api/discovery.js", () => ({ getListingDetail: vi.fn() }));
vi.mock("../lib/api/sellers.js", () => ({ getSellerProfile: vi.fn() }));
vi.mock("../lib/api/views.js", () => ({ recordListingView: vi.fn() }));
vi.mock("../lib/useLiveViewCount.js", () => ({
  publishLiveViewCount: vi.fn(),
}));
vi.mock("../components/media/MediaImage.jsx", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));
vi.mock("../pages/AdDetail.jsx", () => ({
  default: ({ listingId, onClose, headerActions }) => (
    <div>
      <h1>Contact for {listingId}</h1>
      {headerActions}
      <button onClick={onClose}>Close details</button>
    </div>
  ),
}));

beforeEach(() => {
  state.signedIn = true;
  state.saved.clear();
  state.toggle
    .mockReset()
    .mockImplementation(async (id) =>
      state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id),
    );
  getListingDetail.mockReset().mockImplementation(async (id) => ({
    id,
    ownerId: `owner-${id}`,
    title: `Ad ${id}`,
    viewCount: 3,
    saveCount: 2,
    media: [{ status: "READY", cover: true, position: 0, url: `${id}.jpg` }],
  }));
  getSellerProfile
    .mockReset()
    .mockResolvedValue({ seller: { displayName: "Creator" } });
  recordListingView.mockReset().mockResolvedValue({ viewCount: 4 });
  document.documentElement.dataset.ageGate = "ok";
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn(() => ({ matches: true }));
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  HTMLElement.prototype.scrollTo = function ({ top }) {
    this.scrollTop = top;
    fireEvent.scroll(this);
  };
});

test("opens the selected ad and uses vertical keyboard controls with boundaries", async () => {
  render(
    <TrendingAdViewer ids={["a", "b", "c"]} index={1} onClose={vi.fn()} />,
  );
  expect(await screen.findByRole("heading", { name: "Ad b" })).toBeTruthy();
  expect(screen.getByLabelText("Trending ads").scrollTop).toBe(600);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
  expect(await screen.findByRole("heading", { name: "Ad c" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next ad" }).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
  expect(screen.getByRole("heading", { name: "Ad c" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowUp" });
  expect(screen.getByRole("heading", { name: "Ad b" })).toBeTruthy();
});

test("loads only adjacent slides and records views only when the active ad settles", async () => {
  render(
    <TrendingAdViewer ids={["a", "b", "c", "d"]} index={0} onClose={vi.fn()} />,
  );
  await screen.findByRole("heading", { name: "Ad a" });
  expect(getListingDetail.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
  await waitFor(() => expect(recordListingView).toHaveBeenCalledTimes(1));
  expect(recordListingView.mock.calls[0][0]).toBe("a");
  const viewport = screen.getByLabelText("Trending ads");
  viewport.scrollTop = 600;
  fireEvent.scroll(viewport);
  await screen.findByRole("heading", { name: "Ad b" });
  await waitFor(() => expect(recordListingView).toHaveBeenCalledTimes(2));
  expect(recordListingView.mock.calls[1][0]).toBe("b");
  viewport.scrollTop = 0;
  fireEvent.scroll(viewport);
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
  expect(recordListingView).toHaveBeenCalledTimes(2);
  expect(getListingDetail.mock.calls.map(([id]) => id)).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("contact details open in place and return to the same active ad", async () => {
  render(<TrendingAdViewer ids={["a", "b"]} index={0} onClose={vi.fn()} />);
  await screen.findByRole("heading", { name: "Ad a" });
  fireEvent.click(screen.getByRole("button", { name: "View Contact Info" }));
  expect(screen.getByRole("heading", { name: "Contact for a" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
  expect(screen.getByRole("heading", { name: "Contact for a" })).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Back to Trending viewer" }),
  );
  expect(screen.queryByRole("heading", { name: "Contact for a" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Ad a" })).toBeTruthy();
});

test("likes use real saved state and failed mutations show a retry message", async () => {
  render(<TrendingAdViewer ids={["a"]} index={0} onClose={vi.fn()} />);
  await screen.findByRole("heading", { name: "Ad a" });
  fireEvent.click(screen.getByRole("button", { name: "Like ad" }));
  expect(await screen.findByRole("button", { name: "Unlike ad" })).toBeTruthy();
  expect(screen.getByText("3 likes")).toBeTruthy();
  state.toggle.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Unlike ad" }));
  expect(
    await screen.findByText("Couldn't update your like. Please try again."),
  ).toBeTruthy();
  expect(screen.getByText("3 likes")).toBeTruthy();
});

test("closing restores the trigger focus and grid scroll", async () => {
  const feed = document.createElement("div");
  feed.dataset.scroll = "true";
  const trigger = document.createElement("button");
  feed.append(trigger);
  document.body.append(feed);
  feed.scrollTop = 840;
  trigger.focus();
  document.body.style.overflow = "auto";
  const close = vi.fn();
  const view = render(
    <TrendingAdViewer ids={["a"]} index={0} onClose={close} />,
  );
  await screen.findByRole("heading", { name: "Ad a" });
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "Close ad" }));
  expect(close).toHaveBeenCalledOnce();
  feed.scrollTop = 0;
  view.unmount();
  expect(document.activeElement).toBe(trigger);
  expect(feed.scrollTop).toBe(840);
  expect(document.body.style.overflow).toBe("auto");
  feed.remove();
});

test("keeps the updated like count when revisiting an unloaded slide", async () => {
  render(
    <TrendingAdViewer ids={["a", "b", "c"]} index={0} onClose={vi.fn()} />,
  );
  await screen.findByRole("heading", { name: "Ad a" });
  fireEvent.click(screen.getByRole("button", { name: "Like ad" }));
  await screen.findByRole("button", { name: "Unlike ad" });
  fireEvent.click(screen.getByRole("button", { name: "Next ad" }));
  await screen.findByRole("heading", { name: "Ad b" });
  fireEvent.click(screen.getByRole("button", { name: "Next ad" }));
  await screen.findByRole("heading", { name: "Ad c" });
  fireEvent.click(screen.getByRole("button", { name: "Previous ad" }));
  await screen.findByRole("heading", { name: "Ad b" });
  fireEvent.click(screen.getByRole("button", { name: "Previous ad" }));
  await screen.findByRole("heading", { name: "Ad a" });
  expect(
    screen.getByRole("button", { name: "Unlike ad" }).textContent,
  ).toContain("3 likes");
});
