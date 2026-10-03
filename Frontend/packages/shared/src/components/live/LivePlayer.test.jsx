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
test("rotating playback tokens does not restart the same stream and tokens stay on the provider host", async () => {
  const { rerender, unmount } = render(
    <LivePlayer playbackUrl="https://stream.mux.com/abc.m3u8?token=old" />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  rerender(
    <LivePlayer playbackUrl="https://stream.mux.com/abc.m3u8?token=new" />,
  );
  expect(instances).toHaveLength(1);
  const xhr = { open: vi.fn() };
  instances[0].config.xhrSetup(
    xhr,
    "https://stream.mux.com/abc.m3u8?token=old",
  );
  expect(xhr.open).toHaveBeenCalledWith(
    "GET",
    "https://stream.mux.com/abc.m3u8?token=new",
    true,
  );
  xhr.open.mockClear();
  instances[0].config.xhrSetup(xhr, "https://another-host.example/segment.ts");
  expect(xhr.open).not.toHaveBeenCalled();
  unmount();
  expect(instances[0].destroy).toHaveBeenCalledOnce();
});
test("fatal stream errors stop loading and show reconnection instead of a replay", async () => {
  render(
    <LivePlayer playbackUrl="https://stream.mux.com/abc.m3u8?token=old" />,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  act(() => instances[0].events.error(null, { fatal: true }));
  expect(instances[0].stopLoad).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Reconnect video" })).toBeTruthy();
  expect(screen.queryByRole("slider")).toBeNull();
});
