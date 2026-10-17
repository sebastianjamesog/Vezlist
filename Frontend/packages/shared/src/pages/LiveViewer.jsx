"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Eye, Radio } from "lucide-react";
import { getLiveSession } from "../lib/api/live";
import LivePlayer from "../components/live/LivePlayer";
import LiveChat from "../components/live/LiveChat";
const PAYMENT_NAMES = {
  INTERAC: "Interac e-Transfer",
  PAYPAL: "PayPal",
  GPAY: "Google Pay",
};

export default function LiveViewer() {
  const { id } = useParams();
  const [loadedSession, setSession] = useState(null);
  const session = loadedSession?.id === id ? loadedSession : null;
  const sequence = useRef(0);
  const [error, setError] = useState("");
  const [viewers, setViewers] = useState(0);
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(null);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const next = await getLiveSession(id);
      if (request === sequence.current) {
        setSession(next);
        setError("");
      }
    } catch (err) {
      if (request === sequence.current)
        setError(err.message || "Could not load this live session.");
    }
  }, [id]);
  useEffect(() => {
    refresh();
    setNow(Date.now());
    const timer = setInterval(refresh, 30000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("focus", refresh);
    return () => {
      ++sequence.current;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  const ended =
    session &&
    (["ENDED", "FAILED"].includes(session.status) ||
      (session.endsAt && now !== null && Date.parse(session.endsAt) <= now));
  async function copy(method, details) {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(method);
    } catch {
      setCopied("failed");
    }
  }
  return (
    <main className="min-h-dvh bg-[#f4f8ff] px-2 py-3 text-slate-900 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[480px] space-y-4">
        <header className="flex items-center gap-3">
          <Link
            href="/live"
            aria-label="Back to live directory"
            className="grid size-10 place-items-center rounded-full bg-white"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 text-base font-bold">Live now</h1>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
            Free to watch
          </span>
        </header>
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
            <button onClick={refresh} className="ml-3 font-bold underline">
              Retry
            </button>
          </div>
        )}
        {!session ? (
          !error && (
            <p role="status" className="p-8 text-center text-slate-500">
              Loading live session...
            </p>
          )
        ) : ended ? (
          <section className="rounded-2xl bg-white p-10 text-center">
            <Radio className="mx-auto mb-4 size-10 text-slate-400" />
            <h2 className="text-xl font-bold">This live session has ended</h2>
            <p className="mt-3 text-sm text-slate-500">
              Live sessions have no replay.
            </p>
            <Link
              href="/live"
              className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
            >
              Browse live sessions
            </Link>
          </section>
        ) : (
          <>
            <section
              aria-label="Live broadcast"
              className="relative isolate h-[calc(100dvh-104px)] max-h-[800px] min-h-[480px] overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-xl shadow-slate-900/15"
            >
              {session.status === "LIVE" && session.playbackUrl ? (
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
                  <div className="absolute inset-x-8 top-1/3 flex flex-col items-center gap-3 text-center">
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
                      className="min-h-11 rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Check again
                    </button>
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-3 bg-gradient-to-b from-black/80 to-transparent p-4 pb-14">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-white/30 bg-white/15 text-sm font-bold backdrop-blur-sm"
                >
                  {(session.creatorName || "?")
                    .trim()
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/seller/${session.ownerId}`}
                    className="pointer-events-auto block truncate text-sm font-bold hover:underline focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {session.creatorName}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-white/75">
                    {session.title || "Live session"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-extrabold tracking-wider ${session.status === "LIVE" ? "bg-rose-600" : "bg-black/60"}`}
                  >
                    {session.status === "LIVE"
                      ? "LIVE"
                      : session.status === "RECONNECTING"
                        ? "RECONNECTING"
                        : "PREPARING"}
                  </span>
                  <span
                    aria-label={`${viewers} viewers`}
                    className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-xs"
                  >
                    <Eye className="size-3.5" />
                    {viewers}
                  </span>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-4 pb-5 pt-16 [&>*]:pointer-events-auto">
                {["LIVE", "RECONNECTING"].includes(session.status) ? (
                  <LiveChat
                    overlay
                    sessionId={session.id}
                    onViewerCount={setViewers}
                  />
                ) : (
                  <p
                    role="status"
                    className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-white/80"
                  >
                    Chat will connect when the broadcast is live.
                  </p>
                )}
              </div>
            </section>
            <p className="px-2 text-center text-xs text-slate-500">
              Watching is free. Join the conversation above.
            </p>
            {session.paymentDetails?.some(
              (item) => item.enabled && item.details,
            ) && (
              <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <h2 className="font-bold">Pay the creator directly</h2>
                <p className="mb-3 mt-1 text-xs text-slate-600">
                  Optional payments go directly to the creator.
                </p>
                {session.paymentDetails
                  .filter((item) => item.enabled && item.details)
                  .map((item) => (
                    <div
                      key={item.method}
                      className="mt-2 flex items-center gap-3 rounded-xl bg-white p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-blue-700">
                          {PAYMENT_NAMES[item.method] || item.method}
                        </p>
                        <p className="break-all text-sm">{item.details}</p>
                      </div>
                      <button
                        aria-label={`Copy ${PAYMENT_NAMES[item.method]} details`}
                        onClick={() => copy(item.method, item.details)}
                        className="p-2 text-blue-700"
                      >
                        {copied === item.method ? (
                          "Copied"
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </button>
                    </div>
                  ))}
                {copied === "failed" && (
                  <p className="mt-2 text-xs text-red-700">
                    Could not copy. Select the details to copy them manually.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
