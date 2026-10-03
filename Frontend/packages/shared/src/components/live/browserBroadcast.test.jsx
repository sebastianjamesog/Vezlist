import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_BUFFER_BYTES,
  MAX_FRAME_BYTES,
  openBrowserBroadcast,
} from "./browserBroadcast";
let sockets;
let recorders;
class Socket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = 3;
      this.onclose?.();
    });
    sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen();
  }
  message(data) {
    this.onmessage({ data: JSON.stringify(data) });
  }
}
class Recorder {
  static isTypeSupported(type) {
    return type === "video/webm;codecs=vp8,opus";
  }
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = "inactive";
    this.start = vi.fn(() => {
      this.state = "recording";
    });
    this.stop = vi.fn(() => {
      this.state = "inactive";
    });
    recorders.push(this);
  }
}
const stream = { getVideoTracks: () => [{ readyState: "live" }] };
let onError;
let onState;
beforeEach(() => {
  sockets = [];
  recorders = [];
  onError = vi.fn();
  onState = vi.fn();
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("MediaRecorder", Recorder);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const start = () =>
  openBrowserBroadcast({
    stream,
    ticket: "secret-ticket",
    webSocketUrl: "ws://localhost/broadcast",
    onState,
    onError,
  });
describe("bounded browser broadcast", () => {
  test("sends opaque authentication first and encodes only after bridge ready", () => {
    const connection = start();
    sockets[0].open();
    expect(sockets[0].url).not.toContain("secret-ticket");
    expect(JSON.parse(sockets[0].send.mock.calls[0][0])).toEqual({
      type: "authenticate",
      ticket: "secret-ticket",
      mimeType: "video/webm;codecs=vp8,opus",
    });
    expect(recorders).toHaveLength(0);
    sockets[0].message({ type: "ready" });
    expect(recorders[0].start).toHaveBeenCalledWith(250);
    const chunk = new Blob(["video chunk"]);
    recorders[0].ondataavailable({ data: chunk });
    expect(sockets[0].send).toHaveBeenLastCalledWith(chunk);
    connection.stop();
    expect(recorders[0].stop).toHaveBeenCalledOnce();
  });
  test("splits large recorder chunks into ordered bounded WebSocket frames", async () => {
    const connection = start();
    sockets[0].open();
    sockets[0].message({ type: "ready" });
    const chunk = new Blob([new Uint8Array(MAX_FRAME_BYTES * 2 + 17)]);
    recorders[0].ondataavailable({ data: chunk });
    const frames = sockets[0].send.mock.calls.slice(1).map(([frame]) => frame);
    expect(frames.map((frame) => frame.size)).toEqual([
      MAX_FRAME_BYTES,
      MAX_FRAME_BYTES,
      17,
    ]);
    expect(frames.reduce((size, frame) => size + frame.size, 0)).toBe(
      chunk.size,
    );
    connection.stop();
  });

  test("stops immediately when queued data exceeds bounded buffer", () => {
    start();
    sockets[0].open();
    sockets[0].message({ type: "ready" });
    sockets[0].bufferedAmount = MAX_BUFFER_BYTES;
    recorders[0].ondataavailable({ data: new Blob(["more video"]) });
    expect(recorders[0].stop).toHaveBeenCalledOnce();
    expect(sockets[0].close).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("too slow") }),
    );
    expect(sockets[0].send).toHaveBeenCalledTimes(1);
  });
  test("handshake timeout never starts encoding", () => {
    vi.useFakeTimers();
    start();
    sockets[0].open();
    vi.advanceTimersByTime(20001);
    expect(recorders).toHaveLength(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(sockets[0].close).toHaveBeenCalledOnce();
  });
  test("stopped bridge cannot continue sending media", () => {
    start();
    sockets[0].open();
    sockets[0].message({ type: "ready" });
    sockets[0].message({ type: "stopped" });
    recorders[0].ondataavailable({ data: new Blob(["after stop"]) });
    expect(sockets[0].send).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith("stopped");
  });
});
