import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setRoute } from "../../../../testing/stubs/next-navigation.js";
import StatusViewer, {
  ReactionBar,
  ReplyNotice,
  ViewerNote,
} from "./StatusViewer";

const navigate = vi.fn();
let status;
vi.mock("../lib/nav", () => ({ useNavigate: () => navigate }));
vi.mock("../context/StatusContext", () => ({ useStatus: () => status }));
vi.mock("../components/media/MediaImage.jsx", () => ({
  default: ({ src, alt, onLoad, onError }) => (
    <img src={src} alt={alt} onLoad={onLoad} onError={onError} />
  ),
}));
const image = {
  id: "image-1",
  image: "https://example.com/story.jpg",
  mediaType: "IMAGE",
  msAgo: 2000,
};
const video = {
  id: "video-1",
  video: "https://example.com/story.mp4",
  mediaType: "VIDEO",
  msAgo: 1000,
};
const creator = {
  id: "creator-1",
  ownerId: "creator-1",
  own: false,
  name: "Creator One",
  updates: [image],
  msAgo: 1000,
};

describe("backend story viewer", () => {
  beforeEach(() => {
    navigate.mockReset();
    setRoute({ path: "/status/creator-1", params: { id: "creator-1" } });
    status = {
      seen: [],
      ready: true,
      markSeen: vi.fn(),
      react: vi.fn(),
      reactionFor: () => null,
      stories: [creator],
      myStoryReady: true,
      myUpdates: [],
      canManage: true,
      removeStory: vi.fn().mockResolvedValue(undefined),
      error: null,
      refreshStories: vi.fn().mockResolvedValue(undefined),
      loadCreatorStories: vi.fn().mockResolvedValue({ items: [] }),
    };
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("loads a direct creator link before showing empty state", async () => {
    status.stories = [];
    let resolve;
    status.loadCreatorStories.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<StatusViewer />);
    expect(screen.getByRole("status").textContent).toContain("Loading stories");
    expect(screen.queryByText("No active stories")).toBeNull();
    await act(async () => resolve({ items: [] }));
    expect(screen.getByText("No active stories")).toBeTruthy();
    expect(status.loadCreatorStories).toHaveBeenCalledWith("creator-1");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("backend failure offers retry instead of redirecting", async () => {
    status.stories = [];
    status.loadCreatorStories.mockRejectedValueOnce(
      new Error("Server unavailable"),
    );
    const user = userEvent.setup();
    render(<StatusViewer />);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Server unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No active stories")).toBeTruthy();
    expect(status.loadCreatorStories).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("video waits for ended, supports pause and sound, and then advances", async () => {
    vi.useFakeTimers();
    status.stories = [{ ...creator, updates: [video, image] }];
    const { container } = render(<StatusViewer />);
    const element = container.querySelector("video");
    fireEvent.canPlay(element);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(container.querySelector("video")).toBe(element);
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause story" }));
    expect(element.pause).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play story" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn sound on" }));
    expect(element.muted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Play story" }));
    fireEvent.ended(element);
    expect(screen.getByAltText("Creator One's story")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(/2 of 2/)).toBeTruthy();
  });

  test("image timer starts after load and stays paused until resumed", async () => {
    vi.useFakeTimers();
    status.stories = [
      { ...creator, updates: [image, { ...image, id: "image-2" }] },
    ];
    render(<StatusViewer />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByText(/1 of 2/)).toBeTruthy();
    fireEvent.load(screen.getByAltText("Creator One's story"));
    fireEvent.click(screen.getByRole("button", { name: "Pause story" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(screen.getByText(/1 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play story" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(/2 of 2/)).toBeTruthy();
  });

  test("failed deletion retains the story and shows backend error", async () => {
    setRoute({ path: "/status/me", params: { id: "me" } });
    status.stories = [{ ...creator, id: "me", own: true }];
    status.myUpdates = [image];
    status.removeStory.mockRejectedValue(
      new Error("Delete failed. Try again."),
    );
    const user = userEvent.setup();
    render(<StatusViewer />);
    await user.click(
      screen.getByRole("button", { name: "Delete this update" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete failed. Try again.")).toBeTruthy();
    expect(status.removeStory).toHaveBeenCalledWith("image-1");
    expect(screen.getByAltText("Creator One's story")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("direct creator data refreshes on focus and each minute", async () => {
    vi.useFakeTimers();
    render(<StatusViewer />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(status.loadCreatorStories).toHaveBeenCalledTimes(2);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(status.loadCreatorStories).toHaveBeenCalledTimes(3);
  });

  test("own owner-ID deep links continue through the creator queue", async () => {
    status.stories = [
      { ...creator, id: "me", own: true },
      {
        ...creator,
        id: "creator-2",
        ownerId: "creator-2",
        name: "Creator Two",
      },
    ];
    status.myUpdates = [image];
    render(<StatusViewer />);
    await waitFor(() => expect(status.loadCreatorStories).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Next update" }));
    expect(navigate).toHaveBeenCalledWith("/status/creator-2", {
      replace: true,
    });
  });

  test("own owner-ID deep links resolve the own story group", async () => {
    status.stories = [{ ...creator, id: "me", own: true }];
    status.myUpdates = [image];
    render(<StatusViewer />);
    await waitFor(() => expect(status.loadCreatorStories).toHaveBeenCalled());
    expect(screen.getByText("Creator One")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete this update" }),
    ).toBeTruthy();
  });
});

describe("available story interactions", () => {
  test("analytics and replies are clearly unavailable", () => {
    render(
      <>
        <ViewerNote />
        <ReplyNotice />
      </>,
    );
    expect(
      screen.getByText("Story viewer analytics are not available yet."),
    ).toBeTruthy();
    expect(
      screen.getByText("Replies to stories are not available yet."),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  test("reactions remain a device-only choice without fabricated counts", () => {
    render(
      <ReactionBar name="Creator One" reaction={null} onReact={() => {}} />,
    );
    expect(screen.getByText(/Your reaction stays on this device/)).toBeTruthy();
    expect(screen.queryByText(/\d+ (views|reactions)/i)).toBeNull();
  });
});
