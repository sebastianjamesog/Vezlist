import { beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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
  vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue("probably");
  const playbackUrl =
    "https://live.example.gvideo.io/cmaf/session/master.m3u8?quality=auto";
  const { rerender } = render(<LivePlayer playbackUrl={playbackUrl} />);
  expect(screen.getByLabelText("Live video").getAttribute("src")).toBe(
    playbackUrl,
  );
  expect(instances).toHaveLength(0);
  const nextUrl = playbackUrl.replace("quality=auto", "quality=720");
  rerender(<LivePlayer playbackUrl={nextUrl} />);
  expect(screen.getByLabelText("Live video").getAttribute("src")).toBe(nextUrl);
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
