"use client";
import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  Pause,
  Play,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";

export default function LivePlayer({
  playbackUrl,
  title,
  onPlaybackError,
  immersive = false,
}) {
  const video = useRef(null);
  const engine = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [retry, setRetry] = useState(0);

  function catchUp() {
    const element = video.current;
    if (!element) return;
    const edge =
      engine.current?.liveSyncPosition ??
      (element.seekable.length
        ? Math.max(0, element.seekable.end(element.seekable.length - 1) - 3)
        : null);
    if (
      edge !== null &&
      Number.isFinite(edge) &&
      edge - element.currentTime > 15
    )
      element.currentTime = edge;
  }

  useEffect(() => {
    const element = video.current;
    if (!element || !playbackUrl) return;
    let disposed = false;
    let hls;
    setLoading(true);
    setError("");
    const fail = (message) => {
      if (!disposed) {
        setError(message);
        setLoading(false);
        onPlaybackError?.();
      }
    };
    const play = () => {
      if (!disposed) {
        catchUp();
        element.play().catch(() => setPaused(true));
      }
    };
    const setup = async () => {
      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;
        // Chromium can report native HLS support yet fail on a live CMAF
        // stream. Prefer HLS.js when available; keep native-only browsers working.
        if (!Hls.isSupported()) {
          if (element.canPlayType("application/vnd.apple.mpegurl")) {
            element.addEventListener("loadedmetadata", play);
            element.src = playbackUrl;
            return;
          }
          fail(
            "Live video is not supported in this browser. Try another browser.",
          );
          return;
        }
        hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 0,
          maxBufferLength: 15,
        });
        engine.current = hls;
        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(playbackUrl));
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            hls.stopLoad();
            fail(
              "The live video connection was interrupted. Try reconnecting.",
            );
          }
        });
        hls.attachMedia(element);
      } catch {
        fail("Could not load the video player. Please try again.");
      }
    };
    setup();
    const focus = () => {
      if (!element.paused) catchUp();
    };
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      window.removeEventListener("focus", focus);
      element.removeEventListener("loadedmetadata", play);
      hls?.destroy();
      engine.current = null;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [playbackUrl, retry, onPlaybackError]);

  async function togglePlayback() {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      catchUp();
      try {
        await element.play();
        setPaused(false);
        setError("");
      } catch {
        setError("Playback could not start. Please try again.");
      }
    } else {
      element.pause();
      setPaused(true);
    }
  }

  const Controls = immersive ? "details" : "div";
  return (
    <div
      className={
        immersive
          ? "absolute inset-0 bg-black"
          : "relative aspect-[9/13] w-full overflow-hidden rounded-2xl bg-black sm:aspect-video"
      }
    >
      <video
        ref={video}
        aria-label={title || "Live video"}
        muted={muted}
        playsInline
        controls={false}
        disablePictureInPicture
        controlsList="nodownload noremoteplayback"
        onContextMenu={(event) => event.preventDefault()}
        onPlaying={() => {
          setError("");
          setLoading(false);
          setPaused(false);
        }}
        onWaiting={() => setLoading(true)}
        onTimeUpdate={catchUp}
        onError={() => {
          setError("Live video is temporarily unavailable. Try reconnecting.");
          setLoading(false);
        }}
        className={`absolute inset-0 size-full ${immersive ? "object-cover" : "object-contain"}`}
      />
      {!immersive && (
        <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-3 py-1 text-xs font-extrabold text-white">
          LIVE
        </span>
      )}
      {loading && !error && (
        <div
          role="status"
          className={
            immersive
              ? "absolute inset-x-0 top-1/3 flex items-center justify-center gap-2 px-6 text-sm text-white"
              : "absolute inset-0 flex items-center justify-center gap-2 bg-black/30 text-sm text-white"
          }
        >
          <LoaderCircle className="size-6 animate-spin" />
          Connecting video...
        </div>
      )}
      {error && (
        <div
          className={
            immersive
              ? "absolute inset-x-4 top-1/4 z-20 flex flex-col items-center gap-4 rounded-2xl bg-black/80 p-6 text-center text-white"
              : "absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center text-white"
          }
        >
          <p role="alert" className="text-sm">
            {error}
          </p>
          <button
            onClick={() => setRetry((value) => value + 1)}
            className="rounded-xl bg-white px-4 py-2 font-semibold text-black"
          >
            Reconnect video
          </button>
        </div>
      )}
      <Controls
        className={
          immersive
            ? "absolute left-4 top-[88px] z-20"
            : "absolute bottom-3 left-3 right-3"
        }
      >
        {immersive && (
          <summary
            aria-label="Video controls"
            className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md [&::-webkit-details-marker]:hidden"
          >
            <SlidersHorizontal className="size-5" />
          </summary>
        )}
        <div
          className={
            immersive
              ? "mt-2 flex items-center gap-2 rounded-full bg-black/70 p-2"
              : "flex items-center gap-2"
          }
        >
          <button
            onClick={togglePlayback}
            aria-label={paused ? "Play live video" : "Pause live video"}
            className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white"
          >
            {paused ? (
              <Play className="size-5" />
            ) : (
              <Pause className="size-5" />
            )}
          </button>
          <button
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Turn sound on" : "Mute live video"}
            className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white"
          >
            {muted ? (
              <VolumeX className="size-5" />
            ) : (
              <Volume2 className="size-5" />
            )}
          </button>
          <button
            onClick={() => {
              catchUp();
              video.current?.play().catch(() => setPaused(true));
            }}
            className={`${immersive ? "" : "ml-auto"} min-h-10 rounded-full border border-white/15 bg-black/50 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white`}
          >
            Back to live
          </button>
        </div>
      </Controls>
    </div>
  );
}
