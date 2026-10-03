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
    <main className="min-h-dvh bg-[#f4f8ff] px-4 py-5 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center gap-3">
          <Link
            href="/live"
            aria-label="Back to live directory"
            className="grid size-10 place-items-center rounded-full bg-white"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold">
            {session?.title || "Live session"}
          </h1>
          {session && !ended && (
            <span className="flex items-center gap-1 text-sm">
              <Eye className="size-4" />
              {viewers}
            </span>
          )}
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
            {session.status === "LIVE" && session.playbackUrl ? (
              <LivePlayer
                playbackUrl={session.playbackUrl}
                title={`${session.creatorName}'s live video`}
              />
            ) : (
              <div
                role="status"
                className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl bg-slate-950 p-8 text-center text-white"
              >
                <Radio className="size-12 text-rose-500" />
                <h2 className="text-xl font-bold">
                  {session.status === "RECONNECTING"
                    ? "The creator is reconnecting"
                    : "The creator is getting ready"}
                </h2>
                <p className="text-sm text-slate-300">
                  Video will appear when the broadcast is live.
                </p>
                <button
                  onClick={refresh}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm"
                >
                  Check again
                </button>
              </div>
            )}
            <div className="rounded-xl bg-white p-4">
              <Link
                href={`/seller/${session.ownerId}`}
                className="font-bold hover:underline"
              >
                {session.creatorName}
              </Link>
              <p className="mt-1 text-sm text-slate-500">
                Watch for free. Sign in to join the chat.
              </p>
            </div>
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
            <LiveChat sessionId={session.id} onViewerCount={setViewers} />
          </>
        )}
      </div>
    </main>
  );
}
