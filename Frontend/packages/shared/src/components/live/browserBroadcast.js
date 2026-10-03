/** Browser media is encoded into small transient chunks and sent directly to the bridge. */
export const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
export const MAX_FRAME_BYTES = 256 * 1024;
export function broadcastMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || null
  );
}

export function openBrowserBroadcast({
  stream,
  ticket,
  webSocketUrl,
  onState,
  onError,
}) {
  const mimeType = broadcastMimeType();
  if (!mimeType)
    throw new Error(
      "This browser cannot broadcast video. Use a current Chrome, Edge, Firefox, or Safari browser with video encoding support.",
    );
  if (!stream?.getVideoTracks().some((track) => track.readyState === "live"))
    throw new Error("Enable your camera and microphone before broadcasting.");
  const socket = new WebSocket(webSocketUrl);
  let recorder;
  let closed = false;
  let ready = false;
  const tracks = stream.getTracks?.() || stream.getVideoTracks();
  const shutdown = () => {
    if (closed) return;
    closed = true;
    clearTimeout(handshake);
    tracks.forEach((track) => track.removeEventListener?.("ended", mediaEnded));
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )
      socket.close();
  };
  const fail = (message) => {
    if (!closed) {
      shutdown();
      onError(new Error(message));
    }
  };
  const mediaEnded = () =>
    fail(
      "Your camera or microphone disconnected. Please reconnect to continue broadcasting.",
    );
  tracks.forEach((track) => track.addEventListener?.("ended", mediaEnded));
  const handshake = setTimeout(
    () => fail("The broadcast connection timed out. Please reconnect."),
    20000,
  );
  socket.onopen = () => {
    if (closed) return;
    socket.send(JSON.stringify({ type: "authenticate", ticket, mimeType }));
    onState("connecting");
  };
  socket.onmessage = (event) => {
    if (closed || typeof event.data !== "string") return;
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      fail("The broadcast connection returned an invalid response.");
      return;
    }
    if (data.type === "error") {
      fail(data.message || "Broadcasting failed. Please reconnect.");
      return;
    }
    if (data.type === "stopped") {
      shutdown();
      onState("stopped");
      return;
    }
    if (data.type !== "ready" || ready) return;
    ready = true;
    clearTimeout(handshake);
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2000000,
        audioBitsPerSecond: 96000,
      });
      recorder.ondataavailable = ({ data: chunk }) => {
        if (closed || !chunk?.size) return;
        if (socket.readyState !== WebSocket.OPEN) {
          fail("Your broadcast connection was interrupted. Please reconnect.");
          return;
        }
        if (
          chunk.size > MAX_BUFFER_BYTES ||
          socket.bufferedAmount + chunk.size > MAX_BUFFER_BYTES
        ) {
          fail(
            "Your connection is too slow to broadcast. Video transmission stopped; reconnect on a faster connection.",
          );
          return;
        }
        if (chunk.size <= MAX_FRAME_BYTES) socket.send(chunk);
        else
          for (let offset = 0; offset < chunk.size; offset += MAX_FRAME_BYTES) {
            socket.send(chunk.slice(offset, offset + MAX_FRAME_BYTES));
          }
      };
      recorder.onerror = () =>
        fail("The browser stopped encoding your video. Please reconnect.");
      recorder.start(250);
      onState("transmitting");
    } catch (error) {
      fail(error.message || "Could not start video encoding.");
    }
  };
  socket.onerror = () =>
    fail("Could not connect the broadcast. Please reconnect.");
  socket.onclose = () => {
    if (!closed) fail("The broadcast connection closed. Please reconnect.");
  };
  return { stop: shutdown };
}
