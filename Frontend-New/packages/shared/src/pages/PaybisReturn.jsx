"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckBig, CircleX } from "lucide-react";
import { RETURN_MESSAGE, normaliseStatus } from "../lib/paybis";

/**
 * Where Paybis sends the buyer when the checkout ends.
 *
 * It is a bridge, not a destination. The widget runs in an iframe inside the
 * wallet's buy modal, and when it finishes it navigates *that frame* to this
 * page — so what this page mostly does is turn a redirect it received into a
 * message the wallet behind it can hear, and then get out of the way.
 *
 * Two openers, because there are two ways to reach the checkout: `parent` is
 * the embedded widget, `opener` is the new-tab fallback for when the SDK was
 * blocked. Both are our own origin and the message is addressed to it
 * explicitly — a `postMessage` sent to `"*"` is a message any frame on the
 * page can read, and this one names a transaction.
 *
 * If neither exists the buyer opened the URL directly, and then this really is
 * a destination: it says how it went and points back at the wallet.
 *
 * The route wrapping this renders it inside a `<Suspense>`, which is what
 * `useSearchParams` asks for on a prerendered page.
 */
export default function PaybisReturn() {
  const params = useSearchParams();
  const status = normaliseStatus(params.get("outcome"));
  const transactionId =
    params.get("transactionId") ?? params.get("requestId") ?? null;

  useEffect(() => {
    const message = { source: RETURN_MESSAGE, status, transactionId };
    for (const target of [window.parent, window.opener]) {
      if (target && target !== window) {
        target.postMessage(message, window.location.origin);
      }
    }
  }, [status, transactionId]);

  const ok = status === "completed";
  const Glyph = ok ? CircleCheckBig : CircleX;

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm rounded-card bg-surface p-8 text-center shadow-card">
        <span
          className={`mx-auto grid size-14 place-items-center rounded-full ${
            ok ? "bg-brand-soft text-brand" : "bg-danger-soft text-danger"
          }`}
        >
          <Glyph className="size-7" strokeWidth={2.2} />
        </span>
        <h1 className="mt-4 text-[22px] font-extrabold leading-tight text-ink">
          {ok ? "Payment received" : "Payment did not go through"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {ok
            ? "Credits land in your balance as soon as the payment settles. You can close this and go back to your wallet."
            : "Nothing was charged. You can start the purchase again from your wallet."}
        </p>
        <Link
          href="/profile/wallet"
          className="brand-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-[15px] font-semibold text-on-brand shadow-pop"
        >
          Back to credits
        </Link>
      </div>
    </main>
  );
}
