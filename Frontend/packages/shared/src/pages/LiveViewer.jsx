"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Copy, Eye, Flag, Heart, MapPin, Radio, Wallet, X } from "lucide-react";
import { getLiveSession } from "../lib/api/live";
import { useAuth } from "../context/AuthContext";
import { useSaved } from "../context/SavedContext";
import LivePlayer from "../components/live/LivePlayer";
import LiveChat from "../components/live/LiveChat";
import LiveBroadcastStage from "../components/live/LiveBroadcastStage";
import MediaImage from "../components/media/MediaImage.jsx";
import Modal from "../components/ui/Modal";
import ReportDialog from "../components/ReportDialog";

const PAYMENT_NAMES = {
  INTERAC: "Interac e-Transfer",
  PAYPAL: "PayPal",
  GPAY: "Google Pay",
};
const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white";

function startedLabel(session, now) {
  if (!session?.startedAt || !now) return "Free to watch";
  const elapsed = Math.max(
    0,
    Math.floor((now - Date.parse(session.startedAt)) / 60000),
  );
  if (!Number.isFinite(elapsed)) return "Free to watch";
  return `${elapsed < 1 ? "Started just now" : `Started ${elapsed} ${elapsed === 1 ? "minute" : "minutes"} ago`} · Free to watch`;
}

export default function LiveViewer() {
  const { id } = useParams();
  return <LiveViewerSession key={id} id={id} />;
}

function LiveViewerSession({ id }) {
  const { signedIn, user } = useAuth();
  const saved = useSaved();
  const [session, setSession] = useState(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [viewers, setViewers] = useState(null);
  const serverOffset = useRef(0);
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [actionError, setActionError] = useState("");
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await getLiveSession(id);
      if (request === sequence.current) {
        const serverTime = Date.parse(next.serverTime);
        if (Number.isFinite(serverTime))
          serverOffset.current = serverTime - Date.now();
        setNow(Date.now() + serverOffset.current);
        setViewers(
          typeof next.viewerCount === "number" &&
            Number.isFinite(next.viewerCount)
            ? next.viewerCount
            : null,
        );
        setSession(next);
        setError("");
      }
    } catch (err) {
      if (request === sequence.current)
        setError(err.message || "Could not load this live session.");
    }
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    refresh();
    setNow(Date.now());
    const timer = setInterval(refresh, 30000);
    const clock = setInterval(
      () => setNow(Date.now() + serverOffset.current),
      1000,
    );
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      ++sequence.current;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    setReporting(false);
    setActionError("");
  }, [user?.id]);
  const ended =
    session &&
    (["ENDED", "FAILED"].includes(session.status) ||
      (session.endsAt && now !== null && Date.parse(session.endsAt) <= now));
  const payments =
    session?.paymentDetails?.filter((item) => item.enabled && item.details) ??
    [];
  const linkedAd = session?.listingId;
  const ownSession = Boolean(user?.id && user.id === session?.ownerId);
  const signInHref = `/login?next=${encodeURIComponent(`/live/${id}`)}`;
  async function copy(method, details) {
    try {
      await navigator.clipboard.writeText(details);
      if (mounted.current) setCopied(method);
    } catch {
      if (mounted.current) setCopied("failed");
    }
  }
  async function saveAd() {
    if (!signedIn || !linkedAd || saving.current) return;
    saving.current = true;
    setSavePending(true);
    setActionError("");
    try {
      await saved.toggle(linkedAd);
    } catch (err) {
      if (mounted.current)
        setActionError(
          err.message || "Could not update your saved ad. Please try again.",
        );
    } finally {
      saving.current = false;
      if (mounted.current) setSavePending(false);
    }
  }
  const heart =
    linkedAd &&
    !ownSession &&
    (signedIn ? (
      <button
        type="button"
        className={`${ICON_BUTTON} ${saved.isSaved(linkedAd) ? "text-rose-300" : ""}`}
        aria-label={
          saved.isSaved(linkedAd) ? "Unsave linked ad" : "Save linked ad"
        }
        aria-pressed={saved.isSaved(linkedAd)}
        disabled={savePending}
        onClick={saveAd}
      >
        <Heart
          className="size-6"
          fill={saved.isSaved(linkedAd) ? "currentColor" : "none"}
        />
      </button>
    ) : (
      <Link
        href={signInHref}
        aria-label="Sign in to save linked ad"
        className={ICON_BUTTON}
      >
        <Heart className="size-6" />
      </Link>
    ));
  const identity = session && (
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/45 p-1.5 pr-3 backdrop-blur-md">
      <Link
        href={`/seller/${session.ownerId}`}
        aria-label={`View ${session.creatorName}'s profile`}
        className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/20 text-sm font-bold"
      >
        {session.avatarUrl ? (
          <MediaImage
            src={session.avatarUrl}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        ) : (
          (session.creatorName || "?").trim().slice(0, 1).toUpperCase()
        )}
      </Link>
      <div className="min-w-0">
        <Link
          href={`/seller/${session.ownerId}`}
          className="block max-w-[150px] truncate text-sm font-bold hover:underline"
        >
          {session.creatorName}
        </Link>
        {session.location ? (
          <p className="flex items-center gap-1 truncate text-[11px] text-white/80">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{session.location}</span>
          </p>
        ) : (
          <Link
            href={`/seller/${session.ownerId}`}
            className="block text-[11px] text-white/75 hover:underline"
          >
            View profile
          </Link>
        )}
      </div>
    </div>
  );
  const status = session && (
    <div className="flex flex-col items-end gap-2">
      <span
        className={`rounded-md px-2.5 py-1 text-[11px] font-extrabold tracking-wider ${session.status === "LIVE" && !ended ? "bg-rose-600" : "bg-black/65"}`}
      >
        {ended
          ? "ENDED"
          : session.status === "LIVE"
            ? "LIVE"
            : session.status === "RECONNECTING"
              ? "RECONNECTING"
              : "PREPARING"}
      </span>
      {!ended && (
        <span
          aria-label={
            viewers === null
              ? "Viewer count unavailable"
              : `${viewers ?? "\u2014"} ${viewers === 1 ? "viewer" : "viewers"}`
          }
          className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs"
        >
          <Eye className="size-3.5" />
          {viewers ?? "\u2014"}
        </span>
      )}
    </div>
  );
  const media = !session ? (
    <div
      role="status"
      className="absolute inset-0 grid place-items-center p-8 text-sm text-white/80"
    >
      {!error && "Loading live session..."}
    </div>
  ) : ended ? (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center">
      <Radio className="size-10 text-white/50" />
      <h2 className="text-xl font-bold">This live session has ended</h2>
      <p className="text-sm text-white/70">Live sessions have no replay.</p>
      <Link
        href="/live"
        className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950"
      >
        Browse live sessions
      </Link>
    </div>
  ) : session.status === "LIVE" && session.playbackUrl ? (
    <LivePlayer
      immersive
      playbackUrl={session.playbackUrl}
      title={`${session.creatorName}'s live video`}
    />
  ) : (
    <div
      role="status"
      className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#334155,#020617_75%)]"
    >
      <div className="absolute inset-x-8 top-[28%] flex flex-col items-center gap-3 text-center">
        <Radio className="size-10 text-rose-400" />
        <h2 className="text-xl font-bold">
          {session.status === "RECONNECTING"
            ? "The creator is reconnecting"
            : "The creator is getting ready"}
        </h2>
        <p className="text-sm text-white/75">
          Video will appear when the broadcast is live.
        </p>
        <button
          onClick={refresh}
          className="min-h-11 rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold"
        >
          Check again
        </button>
      </div>
    </div>
  );
  return (
    <div className="relative">
      <LiveBroadcastStage
        media={media}
        identity={identity}
        status={status}
        close={
          <Link
            href="/live"
            aria-label="Back to live directory"
            className={ICON_BUTTON}
          >
            <X className="size-6" />
          </Link>
        }
        actions={
          !ended && (
            <>
              {linkedAd &&
                !ownSession &&
                (signedIn ? (
                  <button
                    type="button"
                    onClick={() => setReporting(true)}
                    aria-label="Report linked ad"
                    className={ICON_BUTTON}
                  >
                    <Flag className="size-5" />
                  </button>
                ) : (
                  <Link
                    href={signInHref}
                    aria-label="Sign in to report linked ad"
                    className={ICON_BUTTON}
                  >
                    <Flag className="size-5" />
                  </Link>
                ))}
              {payments.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentsOpen(true)}
                  aria-label="Payment details"
                  className={ICON_BUTTON}
                >
                  <Wallet className="size-5" />
                </button>
              )}
            </>
          )
        }
        title={!ended && (session?.title || "Live session")}
        subtitle={!ended && session && startedLabel(session, now)}
        notice={
          (error || actionError) && (
            <div
              role="alert"
              className="rounded-xl border border-white/20 bg-black/75 p-3 text-sm text-white"
            >
              {error || actionError}
              {error && (
                <button onClick={refresh} className="ml-3 font-bold underline">
                  Retry
                </button>
              )}
            </div>
          )
        }
        footer={
          !ended &&
          session &&
          (["LIVE", "RECONNECTING"].includes(session.status) ? (
            <LiveChat
              overlay
              sessionId={session.id}
              onViewerCount={setViewers}
              composerAction={heart}
            />
          ) : (
            <p
              role="status"
              className="rounded-2xl border border-white/15 bg-black/25 p-3 text-sm text-white/80"
            >
              Chat will connect when the broadcast is live.
            </p>
          ))
        }
      />
      <Modal
        open={paymentsOpen}
        title="Pay the creator directly"
        subtitle="Optional payments go directly to the creator."
        onClose={() => setPaymentsOpen(false)}
        size="max-w-md"
      >
        <div data-no-translate className="space-y-3">
          {payments.map((item) => (
            <div
              key={item.method}
              className="flex items-center gap-3 rounded-xl bg-canvas p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-brand">
                  {PAYMENT_NAMES[item.method] || item.method}
                </p>
                <p className="break-all text-sm text-ink">{item.details}</p>
              </div>
              <button
                aria-label={`Copy ${PAYMENT_NAMES[item.method] || item.method} details`}
                onClick={() => copy(item.method, item.details)}
                className="grid min-h-11 min-w-11 place-items-center rounded-full text-brand"
              >
                {copied === item.method ? (
                  "Copied"
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
          ))}
        </div>
        {copied === "failed" && (
          <p role="alert" className="mt-3 text-sm text-danger">
            Could not copy. Select the details to copy them manually.
          </p>
        )}
      </Modal>
      {linkedAd && signedIn && (
        <ReportDialog
          key={`${linkedAd}:${user?.id}`}
          open={reporting}
          targetType="listing"
          targetId={linkedAd}
          targetLabel={session?.title || "Linked ad"}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
