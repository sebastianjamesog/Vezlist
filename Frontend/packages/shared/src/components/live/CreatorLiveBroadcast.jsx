"use client";

import { useState } from "react";
import {
  Eye,
  MapPin,
  Mic,
  MicOff,
  Radio,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import LiveBroadcastStage from "./LiveBroadcastStage.jsx";
import LiveChat from "./LiveChat";
import LiveTimeRemaining, { LiveExpiryWarning } from "./LiveTimeRemaining.jsx";
import MediaImage from "../media/MediaImage.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { compactCount } from "../../lib/format.js";

const ICON_BUTTON =
  "grid size-11 place-items-center rounded-full border border-white/20 bg-black/50 text-white backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50";

export default function CreatorLiveBroadcast({
  session,
  now,
  media,
  terminal,
  broadcastState,
  viewers,
  onViewerCount,
  muted,
  cameraOff,
  pending,
  error,
  streamingAvailable,
  onReconnect,
  onEnd,
  onLeave,
  onToggleMicrophone,
  onToggleCamera,
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const status = terminal
    ? "ENDED"
    : session.status === "LIVE"
      ? "LIVE"
      : session.status === "RECONNECTING"
        ? "RECONNECTING"
        : "PREPARING";
  const elapsed =
    session.startedAt && Number.isFinite(now)
      ? Math.max(0, Math.floor((now - Date.parse(session.startedAt)) / 1000))
      : 0;
  const elapsedLabel = Number.isFinite(elapsed)
    ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
    : "00:00";
  async function leave() {
    setConfirmClose(false);
    if (await onEnd()) onLeave();
  }
  return (
    <>
      <LiveBroadcastStage
        ariaLabel="Your live broadcast"
        media={
          media && !terminal ? (
            media
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#334155,#020617_75%)]">
              <div className="absolute inset-x-6 top-1/3 flex flex-col items-center gap-4 text-center">
                <Radio className="size-12 text-rose-400" aria-hidden="true" />
                <h2 className="text-xl font-bold">
                  {terminal
                    ? "Your session has ended"
                    : "Connect your camera to broadcast"}
                </h2>
                {!terminal && (
                  <button
                    disabled={
                      pending ||
                      broadcastState === "connecting" ||
                      !streamingAvailable
                    }
                    onClick={onReconnect}
                    className="min-h-11 rounded-full border border-white/30 bg-white/15 px-5 py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    {pending || broadcastState === "connecting"
                      ? "Connecting camera..."
                      : "Reconnect camera & microphone"}
                  </button>
                )}
              </div>
            </div>
          )
        }
        identity={
          <div className="flex items-center gap-2 rounded-full bg-black/50 py-1.5 pl-1.5 pr-4 backdrop-blur-sm">
            <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-rose-400 bg-white/15 text-sm font-bold">
              {session.avatarUrl ? (
                <MediaImage
                  fill
                  src={session.avatarUrl}
                  alt=""
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                (session.creatorName || "You").trim().slice(0, 1).toUpperCase()
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">
                {session.creatorName || "You"}
              </p>
              <p className="truncate text-[11px] text-white/80">
                Your broadcast ·{" "}
                <span className="tabular-nums">{elapsedLabel}</span>
              </p>
              {session.location && (
                <p className="flex items-center gap-1 text-[10px] text-white/75">
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{session.location}</span>
                </p>
              )}
            </div>
          </div>
        }
        close={
          <button
            type="button"
            aria-label={terminal ? "Close broadcast" : "End live and leave"}
            disabled={pending}
            className={ICON_BUTTON}
            onClick={() => (terminal ? onLeave() : setConfirmClose(true))}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        }
        status={
          <div className="flex flex-col items-end gap-1.5">
            <span
              className={`rounded-md px-2 py-1 text-[10px] font-extrabold tracking-wider ${status === "LIVE" ? "bg-rose-600" : "bg-black/65"}`}
            >
              {status === "LIVE" && (
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block size-1.5 rounded-full bg-white"
                />
              )}
              {status}
            </span>
            <span
              aria-label={
                viewers == null
                  ? "Viewer count unavailable"
                  : `${viewers} viewers`
              }
              className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs"
            >
              <Eye className="size-3" aria-hidden="true" />
              {viewers == null ? "—" : compactCount(viewers)}
            </span>
          </div>
        }
        actions={
          !terminal && broadcastState === "transmitting" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onToggleMicrophone}
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                aria-pressed={muted}
                className={ICON_BUTTON}
              >
                {muted ? (
                  <MicOff className="size-5" />
                ) : (
                  <Mic className="size-5" />
                )}
              </button>
              <button
                type="button"
                onClick={onToggleCamera}
                aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
                aria-pressed={cameraOff}
                className={ICON_BUTTON}
              >
                {cameraOff ? (
                  <VideoOff className="size-5" />
                ) : (
                  <Video className="size-5" />
                )}
              </button>
            </div>
          ) : null
        }
        notice={
          <div className="space-y-2">
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-300/40 bg-rose-950/95 px-3 py-2 text-xs text-rose-50"
              >
                {error}
              </p>
            )}
            {!terminal && <LiveExpiryWarning session={session} now={now} />}
          </div>
        }
        title={session.title || "Live session"}
        subtitle={
          terminal
            ? "Your camera and microphone are off. Live sessions have no replay."
            : "Your viewers see this broadcast live"
        }
        footer={
          terminal ? (
            <button
              type="button"
              onClick={onLeave}
              className="min-h-11 w-full rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white"
            >
              Back to Live Now
            </button>
          ) : (
            <>
              {["LIVE", "RECONNECTING"].includes(session.status) ? (
                <LiveChat
                  overlay
                  sessionId={session.id}
                  host
                  onViewerCount={onViewerCount}
                />
              ) : (
                <div className="rounded-xl border border-white/15 bg-black/35 p-3 text-xs text-white/85">
                  <p>
                    Waiting for the video provider to confirm the broadcast.
                  </p>
                  <p role="status" className="mt-1">
                    Chat will connect when your broadcast is live.
                  </p>
                </div>
              )}
              {media && broadcastState !== "transmitting" && (
                <button
                  disabled={
                    pending ||
                    broadcastState === "connecting" ||
                    !streamingAvailable
                  }
                  onClick={onReconnect}
                  className="mt-2 min-h-10 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {pending || broadcastState === "connecting"
                    ? "Connecting camera..."
                    : "Reconnect camera & microphone"}
                </button>
              )}
            </>
          )
        }
        bottomControls={
          !terminal && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3">
              <LiveTimeRemaining session={session} now={now} />
              <button
                type="button"
                onClick={onEnd}
                disabled={pending}
                className="min-h-11 rounded-full bg-rose-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {pending ? "Ending..." : "End Live"}
              </button>
            </div>
          )
        }
      />
      <ConfirmDialog
        open={confirmClose && !terminal}
        title="End live and leave?"
        body="Your camera and microphone will stop, and the broadcast will end for everyone."
        confirmLabel="End live and leave"
        destructive
        onClose={() => setConfirmClose(false)}
        onConfirm={leave}
      />
    </>
  );
}
