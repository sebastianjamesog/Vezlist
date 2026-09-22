"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eye,
  Heart,
  Mic,
  MicOff,
  SendHorizonal,
  SwitchCamera,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useNavigate } from "../lib/nav";
import { useToast } from "../context/ToastContext";
import { useAccount } from "../context/AccountContext";
import ConfirmDialog from "../components/ui/ConfirmDialog";

/** How often the audience moves, and how far in one step. */
const TICK_MS = 4000;
const JOIN_DRIFT = 7;
const COMMENT_MS = 5200;
/** A floating heart's lifetime, matched to the `live-heart` keyframe. */
const HEART_MS = 1800;

/**
 * The lines that arrive while you are broadcasting. A fixed pool walked in
 * order rather than sampled: a random pick during a render is a hydration
 * mismatch waiting to happen, and even inside an effect it makes a bug that
 * reproduces one time in eight.
 */
const INCOMING = [
  { name: "marcus_r", text: "the light is unreal right now" },
  { name: "priya.k", text: "how long are you on for?" },
  { name: "dana", text: "first time catching one of these live 👋" },
  { name: "theo", text: "can you show the other side?" },
  { name: "ilse_v", text: "following!" },
  { name: "sam", text: "audio is perfect" },
  { name: "noor", text: "what camera is that" },
  { name: "ravi", text: "this is great, thanks for doing it" },
];

/** mm:ss, and hh:mm:ss once a broadcast has run past the hour. */
function elapsed(seconds) {
  const s = String(seconds % 60).padStart(2, "0");
  const m = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/**
 * The broadcaster's side of a live stream.
 *
 * Built to the same pattern as every live-broadcast screen people already
 * know: the camera is the whole screen, the chrome floats on it, and there is
 * exactly one big control — the shutter — before you are live. `LiveViewer`
 * is the other half of this and is laid out the same way, so someone who has
 * watched a broadcast recognises the screen they use to make one.
 *
 * ── The camera is real ────────────────────────────────────────────────────
 *
 * `getUserMedia` gives a genuine local preview, which is the part of
 * broadcasting a browser can do on its own, so this uses it rather than
 * drawing a fake viewfinder. Nothing is encoded or uploaded: the track is
 * attached to a local `<video>` and stopped again on the way out, so the
 * camera light goes off when the screen does. The mic and camera toggles
 * drive the real tracks, and flipping swaps `facingMode` for a new one.
 *
 * The personals origin allows `camera=(self), microphone=(self)` in its
 * `Permissions-Policy` (see `apps/personals/middleware.js`) precisely for this
 * screen. Both were denied outright until it existed, and the denial won
 * silently — the screen fell back to its no-camera state and looked like a
 * browser problem rather than a header we set ourselves.
 *
 * Permission being refused is still a normal outcome rather than an error
 * state: a device that says no gets the whole screen with a placeholder where
 * the picture would be.
 */
export default function GoLive() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAccount();

  const [phase, setPhase] = useState("setup");
  const [title, setTitle] = useState("");
  const [facing, setFacing] = useState("user");
  const [stream, setStream] = useState(null);
  const [denied, setDenied] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [chat, setChat] = useState([]);
  const [draft, setDraft] = useState("");
  const [hearts, setHearts] = useState([]);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const video = useRef(null);
  const chatEnd = useRef(null);
  const nextIncoming = useRef(0);
  const nextKey = useRef(0);

  /**
   * Ask for the camera, and hand the tracks back on the way out. The cleanup
   * is the part that matters: without it the camera light stays on after the
   * screen is gone, which is the most alarming thing a page like this can do.
   * Re-runs on `facing`, which is what makes flipping work.
   */
  useEffect(() => {
    let live = true;
    let granted = null;

    async function ask() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setDenied(true);
        return;
      }
      try {
        granted = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: true,
        });
        if (!live) {
          granted.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(granted);
        setDenied(false);
      } catch {
        if (live) setDenied(true);
      }
    }

    ask();
    return () => {
      live = false;
      granted?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  // `srcObject` is not an attribute, so it cannot be set in JSX.
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
  }, [stream]);

  // The toggles drive the real tracks, so muting actually mutes rather than
  // only changing which icon is drawn.
  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [stream, micOn]);

  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [stream, camOn]);

  /** The clock. One interval, started when the broadcast is. */
  useEffect(() => {
    if (phase !== "live") return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  /** People arriving. A climb with a wobble in it, never below one. */
  useEffect(() => {
    if (phase !== "live") return undefined;
    const timer = setInterval(() => {
      setViewers((v) =>
        Math.max(1, v + Math.round((Math.random() - 0.3) * JOIN_DRIFT)),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  /** ...and saying things once they are here. */
  useEffect(() => {
    if (phase !== "live") return undefined;
    const timer = setInterval(() => {
      const next = INCOMING[nextIncoming.current % INCOMING.length];
      nextIncoming.current += 1;
      setChat((c) => [...c, { ...next, id: `in-${nextKey.current++}` }]);
    }, COMMENT_MS);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [chat.length]);

  const leave = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    navigate("/live", { replace: true });
  }, [stream, navigate]);

  function start() {
    if (!can("live.host")) {
      toast("Switch to an ads creator account to go live");
      return;
    }
    // A broadcast opens on the people already waiting on the board, not on
    // zero — a counter climbing from nothing reads as a failed connection for
    // the first ten seconds of every stream.
    setViewers(3);
    setPhase("live");
  }

  function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setChat((c) => [
      ...c,
      { id: `me-${nextKey.current++}`, name: "You", text, own: true },
    ]);
    setDraft("");
  }

  function heart() {
    const key = nextKey.current++;
    setHearts((h) => [...h, { key, offset: Math.random() * 28 - 14 }]);
    setTimeout(
      () => setHearts((h) => h.filter((x) => x.key !== key)),
      HEART_MS,
    );
  }

  const setup = phase === "setup";
  const chip =
    "grid size-10 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-transform active:scale-90";

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-black lg:max-w-none">
      {/* ---- The picture ------------------------------------------------ */}
      {stream && (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          // The front camera is mirrored the way every phone mirrors its own
          // self-view: you are looking at yourself, and an unmirrored one
          // makes people think the shot is reversed. The rear camera is not.
          className={`absolute inset-0 size-full object-cover transition-opacity ${
            facing === "user" ? "-scale-x-100" : ""
          } ${camOn ? "opacity-100" : "opacity-0"}`}
        />
      )}

      {!stream && (
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#1e1b4b,#4c1d95_55%,#831843)]" />
      )}

      {denied && (
        <div className="absolute inset-0 grid place-items-center px-10">
          <div className="flex flex-col items-center gap-2 text-center text-white/80">
            <Video className="size-8" strokeWidth={2} />
            <p className="text-[15px] font-bold text-white">No camera here</p>
            <p className="text-[13px] leading-snug">
              This device refused camera access. Everything else on this screen
              still works.
            </p>
          </div>
        </div>
      )}

      {camOn === false && stream && (
        <div className="absolute inset-0 grid place-items-center bg-black">
          <div className="flex flex-col items-center gap-2 text-white/70">
            <VideoOff className="size-8" strokeWidth={2} />
            <p className="text-[14px] font-bold">Camera off</p>
          </div>
        </div>
      )}

      {/* Dark at both ends, clear through the middle: the chrome sits top and
          bottom, the picture is what is between them. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.55)_0%,rgb(0_0_0/0)_22%,rgb(0_0_0/0)_46%,rgb(0_0_0/0.75)_82%,rgb(0_0_0/0.92)_100%)]"
      />

      {/* ---- Top chrome -------------------------------------------------- */}
      <header className="relative z-10 flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {setup ? (
          <>
            <button onClick={leave} aria-label="Close" className={chip}>
              <X className="size-5" strokeWidth={2.4} />
            </button>
            <div className="flex-1" />
            <button
              onClick={() =>
                setFacing((f) => (f === "user" ? "environment" : "user"))
              }
              aria-label="Flip camera"
              className={chip}
            >
              <SwitchCamera className="size-5" strokeWidth={2.3} />
            </button>
          </>
        ) : (
          <>
            {/* Live first, count second, in that order and that colour,
                because "is this happening" is the question and "how many"
                is the follow-up. */}
            <span className="flex items-center gap-1.5 rounded-lg bg-red-500 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              Live
            </span>
            <span className="flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 text-[12px] font-bold tabular-nums text-white backdrop-blur-md">
              <Eye className="size-3.5" strokeWidth={2.4} />
              {viewers.toLocaleString()}
            </span>
            <span className="rounded-lg bg-black/50 px-2 py-1 text-[12px] font-bold tabular-nums text-white backdrop-blur-md">
              {elapsed(seconds)}
            </span>

            <div className="flex-1" />

            <button
              onClick={() => setConfirmEnd(true)}
              className="h-8 shrink-0 rounded-lg bg-white/90 px-3 text-[13px] font-extrabold text-ink transition-transform active:scale-95"
            >
              End
            </button>
          </>
        )}
      </header>

      <div className="relative z-10 min-h-0 flex-1" />

      {/* ---- Setup: a title and one big button --------------------------- */}
      {setup ? (
        <div className="relative z-10 flex flex-col items-center gap-5 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="Add a title…"
            aria-label="Broadcast title"
            className="w-full rounded-full border border-white/25 bg-black/40 px-5 py-3 text-center text-[15px] font-semibold text-white outline-none backdrop-blur-md placeholder:text-white/55 focus:border-white/70"
          />

          {/* The shutter. One control, unmissable, and the only thing on this
              half of the screen — a title is optional, going live is not. */}
          <button
            onClick={start}
            aria-label="Go live"
            className="grid size-[74px] place-items-center rounded-full ring-4 ring-white/90 transition-transform active:scale-95"
          >
            <span className="size-[58px] rounded-full bg-red-500 shadow-lift" />
          </button>
          <p className="-mt-2 text-[13px] font-bold text-white/85">Go live</p>
        </div>
      ) : (
        /* ---- Live: comments, then the row you type into ---------------- */
        <div className="relative z-10 flex flex-col gap-2.5 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-h-[32vh] space-y-2 overflow-y-auto pr-14">
            {chat.map((c) => (
              <p key={c.id} className="text-[13px] leading-snug">
                <span
                  className={`font-bold ${c.own ? "text-brand-2" : "text-white/75"}`}
                >
                  {c.name}
                </span>{" "}
                <span className="text-white">{c.text}</span>
              </p>
            ))}
            <div ref={chatEnd} />
          </div>

          <div className="flex items-center gap-2">
            <form onSubmit={send} className="flex min-w-0 flex-1 items-center">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                className="min-w-0 flex-1 rounded-full border border-white/25 bg-black/40 px-4 py-2.5 text-[14px] text-white outline-none backdrop-blur-md placeholder:text-white/55 focus:border-white/70"
              />
              <button
                type="submit"
                aria-label="Send"
                className={`${chip} ml-1.5`}
              >
                <SendHorizonal className="size-[18px]" strokeWidth={2.4} />
              </button>
            </form>

            {/* The heart floats out of this button, so the stack it rises
                through is anchored here rather than in the middle. */}
            <div className="relative">
              {hearts.map((h) => (
                <span
                  key={h.key}
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-full left-1/2 text-red-500"
                  style={{
                    animation: `live-heart ${HEART_MS}ms ease-out forwards`,
                    ["--heart-x"]: `${h.offset}px`,
                  }}
                >
                  <Heart className="size-6 fill-current" strokeWidth={0} />
                </span>
              ))}
              <button
                onClick={heart}
                aria-label="Send a heart"
                className={chip}
              >
                <Heart className="size-5" strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* The broadcaster's own switches, on their own row so a mis-tap
              while typing cannot cut the camera. */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMicOn((v) => !v)}
              aria-pressed={!micOn}
              aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
              className={micOn ? chip : `${chip} bg-white text-ink`}
            >
              {micOn ? (
                <Mic className="size-5" strokeWidth={2.3} />
              ) : (
                <MicOff className="size-5" strokeWidth={2.3} />
              )}
            </button>

            <button
              onClick={() => setCamOn((v) => !v)}
              aria-pressed={!camOn}
              aria-label={camOn ? "Turn camera off" : "Turn camera on"}
              className={camOn ? chip : `${chip} bg-white text-ink`}
            >
              {camOn ? (
                <Video className="size-5" strokeWidth={2.3} />
              ) : (
                <VideoOff className="size-5" strokeWidth={2.3} />
              )}
            </button>

            <button
              onClick={() =>
                setFacing((f) => (f === "user" ? "environment" : "user"))
              }
              aria-label="Flip camera"
              className={chip}
            >
              <SwitchCamera className="size-5" strokeWidth={2.3} />
            </button>

            {title.trim() && (
              <p className="ml-1 min-w-0 truncate text-[13px] font-semibold text-white/80">
                {title}
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmEnd}
        title="End your live video?"
        body={
          viewers
            ? `${viewers.toLocaleString()} ${viewers === 1 ? "person is" : "people are"} watching. Ending closes the room for all of them.`
            : "Ending closes the room."
        }
        confirmLabel="End video"
        destructive
        onConfirm={() => {
          setConfirmEnd(false);
          toast(`Live video ended after ${elapsed(seconds)}`);
          leave();
        }}
        onClose={() => setConfirmEnd(false)}
      />
    </div>
  );
}
