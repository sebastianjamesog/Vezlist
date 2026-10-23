import { beforeEach, expect, test, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Hls from "hls.js";
import LivePlayer from "./LivePlayer";
const { instances } = vi.hoisted(() => ({ instances: [] }));
vi.mock("hls.js", () => ({
  default: class Hls {
    static Events = {
      MEDIA_ATTACHED: "attached",
      MANIFEST_PARSED: "manifest",
      ERROR: "error",
    };
    static isSupported() {
      return true;
    }
    constructor(config) {
      this.config = config;
      this.events = {};
      this.loadSource = vi.fn();
      this.stopLoad = vi.fn();
      this.destroy = vi.fn();
      this.liveSyncPosition = 80;
      instances.push(this);
    }
    on(name, callback) {
      this.events[name] = callback;
    }
    attachMedia() {
      this.events.attached();
    }
  },
}));
beforeEach(() => {
  instances.length = 0;
  vi.spyOn(Hls, "isSupported").mockReturnValue(true);
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
test("plays the complete provider URL and only restarts when that URL changes", async () => {
  const playbackUrl =
    "https://live.example.gvideo.io/cmaf/session/master.m3u8?quality=auto";
  const { rerender, unmount } = render(
    <LivePlayer playbackUrl={playbackUrl} />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  expect(instances[0].loadSource).toHaveBeenCalledWith(playbackUrl);
  rerender(<LivePlayer playbackUrl={playbackUrl} title="Updated title" />);
  expect(instances).toHaveLength(1);
  expect(instances[0].destroy).not.toHaveBeenCalled();
  const nextUrl = playbackUrl.replace("quality=auto", "quality=720");
  rerender(<LivePlayer playbackUrl={nextUrl} />);
  await waitFor(() => expect(instances).toHaveLength(2));
  expect(instances[0].destroy).toHaveBeenCalledOnce();
  expect(instances[1].loadSource).toHaveBeenCalledWith(nextUrl);
  unmount();
  expect(instances[1].destroy).toHaveBeenCalledOnce();
});
test("native HLS preserves the complete provider URL", async () => {
  vi.mocked(Hls.isSupported).mockReturnValue(false);
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("probably");
  const playbackUrl =
    "https://live.example.gvideo.io/cmaf/session/master.m3u8?quality=auto";
  const { rerender } = render(<LivePlayer playbackUrl={playbackUrl} />);
  await waitFor(() =>
    expect(screen.getByLabelText("Live video").getAttribute("src")).toBe(
      playbackUrl,
    ),
  );
  expect(instances).toHaveLength(0);
  const nextUrl = playbackUrl.replace("quality=auto", "quality=720");
  rerender(<LivePlayer playbackUrl={nextUrl} />);
  await waitFor(() =>
    expect(screen.getByLabelText("Live video").getAttribute("src")).toBe(
      nextUrl,
    ),
  );
});

test("uses HLS.js even when Chromium advertises native HLS support", async () => {
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("maybe");
  const playbackUrl = "https://live.example.gvideo.io/cmaf/session/master.m3u8";
  render(<LivePlayer playbackUrl={playbackUrl} />);
  await waitFor(() => expect(instances).toHaveLength(1));
  expect(instances[0].loadSource).toHaveBeenCalledWith(playbackUrl);
  expect(screen.getByLabelText("Live video").getAttribute("src")).not.toBe(
    playbackUrl,
  );
});

test("clears a video error when playback successfully resumes", async () => {
  render(
    <LivePlayer playbackUrl="https://live.example.gvideo.io/cmaf/session/master.m3u8" />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  const video = screen.getByLabelText("Live video");
  fireEvent.error(video);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.playing(video);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("explains when neither HLS.js nor native playback is supported", async () => {
  vi.mocked(Hls.isSupported).mockReturnValue(false);
  render(
    <LivePlayer playbackUrl="https://live.example.gvideo.io/cmaf/session/master.m3u8" />,
  );
  expect(
    await screen.findByText(
      "Live video is not supported in this browser. Try another browser.",
    ),
  ).toBeTruthy();
  expect(instances).toHaveLength(0);
});
test("fatal stream errors stop loading and show reconnection instead of a replay", async () => {
  render(
    <LivePlayer playbackUrl="https://live.example.gvideo.io/cmaf/session/master.m3u8" />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  act(() => instances[0].events.error(null, { fatal: true }));
  expect(instances[0].stopLoad).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Reconnect video" })).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
});

test("immersive controls remain accessible without a separate video toolbar", async () => {
  render(
    <LivePlayer
      immersive
      playbackUrl="https://live.example.gvideo.io/cmaf/session/master.m3u8"
    />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  const disclosure = screen.getByLabelText("Video controls");
  const details = disclosure.closest("details");
  expect(details.open).toBe(false);
  fireEvent.click(disclosure);
  expect(details.open).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Turn sound on" }));
  expect(screen.getByLabelText("Live video").muted).toBe(false);
  expect(screen.getByRole("button", { name: "Mute live video" })).toBeTruthy();
  Object.defineProperty(screen.getByLabelText("Live video"), "paused", { value: false, configurable: true });
  fireEvent.click(screen.getByRole("button", { name: "Pause live video" }));
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Play live video" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to live" }));
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
});
