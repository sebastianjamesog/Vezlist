"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  PlugZap,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Button from "../ui/Button";
import { Skeleton, SkeletonGroup } from "../ui/Skeleton";
import {
  readReturnMessage,
  widgetScriptUrl,
  widgetUrl,
} from "../../lib/paybis";

/**
 * The Paybis checkout, embedded in the buy-credits modal.
 *
 * The buyer never leaves the wallet: the widget mounts in the box below the
 * pack they picked, takes the card details, runs whatever KYC the amount and
 * the country call for, and settles into our payout address. Everything it
 * needs to do that arrived from `/api/paybis/request` — a `requestId` and
 * nothing else. No key, no price, no address (see `server/paybisRequest.js`).
 *
 * Four things can happen and all four have a screen here, because a checkout
 * that only handles the happy path is a checkout that strands people holding a
 * card:
 *
 *   - **starting** — the request is in flight. A box the size of the widget,
 *     so nothing jumps when it swaps in.
 *   - **ready** — the widget is mounted and owns the box.
 *   - **fallback** — the SDK did not load. A third-party script is the single
 *     most blocked thing on the web (an extension, a strict DNS, a corporate
 *     proxy), and the same `requestId` opens the same checkout as a plain URL
 *     in a new tab. Uglier, and it takes the money.
 *   - **unconfigured / error** — no merchant account behind this deploy, or
 *     Paybis said no. Say which, and offer the way forward that exists.
 */

/**
 * The Web SDK, loaded once per environment.
 *
 * Kept at module scope rather than in state so that reopening the modal — or
 * buying a second pack — reuses the script already on the page. A *failed*
 * load is deliberately not cached: retrying is the whole point of the button
 * the failure renders.
 */
const loaders = new Map();

function loadWidgetSdk(environment) {
  if (window.PartnerExchangeWidget?.openInEmbed) {
    return Promise.resolve(window.PartnerExchangeWidget);
  }
  const cached = loaders.get(environment);
  if (cached) return cached;

  const loading = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = widgetScriptUrl(environment);
    el.async = true;
    el.onload = () =>
      window.PartnerExchangeWidget
        ? resolve(window.PartnerExchangeWidget)
        : reject(new Error("paybis: script loaded without the widget global"));
    el.onerror = () => reject(new Error("paybis: widget script blocked"));
    document.head.append(el);
  });

  loading.catch(() => loaders.delete(environment));
  loaders.set(environment, loading);
  return loading;
}

export default function PaybisCheckout({ pack, onSettled, onSimulate }) {
  const [phase, setPhase] = useState("starting");
  const [session, setSession] = useState(null);
  // Bumping this is what Retry means: it re-runs the request from the top
  // rather than reusing a `requestId` that may already have been spent.
  const [attempt, setAttempt] = useState(0);
  const box = useRef(null);

  const retry = useCallback(() => {
    setSession(null);
    setPhase("starting");
    setAttempt((n) => n + 1);
  }, []);

  // 1. Ask our own server to open a transaction request. Nothing is reset on
  //    the way in: the component is keyed on the pack, so a different pack is
  //    a different component, and `retry` clears the phase before it bumps.
  useEffect(() => {
    let live = true;

    fetch("/api/paybis/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: pack.id }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Checkout unavailable.");
        return data;
      })
      .then((data) => {
        if (!live) return;
        if (!data.configured) {
          setPhase("unconfigured");
          return;
        }
        setSession({
          requestId: data.requestId,
          environment: data.environment,
        });
        setPhase("ready");
      })
      .catch(() => {
        if (live) setPhase("error");
      });

    return () => {
      live = false;
    };
  }, [pack.id, attempt]);

  // 2. Mount the widget in the box. `openInEmbed` is positional and comes off
  //    a script we do not control, so a throw here is a fallback, not a crash.
  useEffect(() => {
    if (phase !== "ready" || !session || !box.current) return;
    let live = true;

    loadWidgetSdk(session.environment)
      .then((sdk) => {
        if (!live || !box.current) return;
        // The second argument is the SSO one-time token. We do not run SSO —
        // Paybis collects the buyer's email itself — so it goes out empty.
        sdk.openInEmbed(session.requestId, undefined, box.current);
      })
      .catch((error) => {
        console.error(error);
        if (live) setPhase("fallback");
      });

    return () => {
      live = false;
    };
  }, [phase, session]);

  // 3. Listen for the outcome. Advisory only — see `readReturnMessage`, and
  //    see the webhook note in `server/paybisRequest.js` for what settles it.
  useEffect(() => {
    if (!session) return;

    const onMessage = (event) => {
      const result = readReturnMessage(event, {
        selfOrigin: window.location.origin,
        environment: session.environment,
      });
      if (result) onSettled(result);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [session, onSettled]);

  if (phase === "starting") {
    return (
      <SkeletonGroup label="Opening checkout" className="space-y-3">
        <Skeleton className="h-12 w-full rounded-card" />
        <Skeleton className="h-12 w-full rounded-card" />
        <Skeleton className="h-[260px] w-full rounded-card" />
      </SkeletonGroup>
    );
  }

  if (phase === "ready") {
    return (
      <div>
        <div
          ref={box}
          // Sized before the widget arrives so the modal does not grow under
          // the buyer's thumb the moment it mounts.
          className="min-h-[420px] w-full overflow-hidden rounded-card bg-canvas"
        />
        <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
          <ShieldCheck className="mt-px size-4 shrink-0" strokeWidth={2.2} />
          <span>
            Card details go to Paybis, never to us — they handle the payment and
            any identity checks it needs. Credits land in your balance once the
            payment settles.
          </span>
        </p>
      </div>
    );
  }

  if (phase === "fallback" && session) {
    const href = widgetUrl({
      environment: session.environment,
      requestId: session.requestId,
    });
    return (
      <Notice
        icon={ExternalLink}
        title="Open the checkout in a new tab"
        body="Something on this browser blocked the Paybis widget from loading — an extension or a network filter, usually. The same checkout works as a page."
      >
        <Button
          size="lg"
          className="w-full"
          to={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          Continue on Paybis
          <ExternalLink className="size-4" strokeWidth={2.4} />
        </Button>
      </Notice>
    );
  }

  if (phase === "unconfigured") {
    return (
      <Notice
        icon={PlugZap}
        title="Paybis is not connected on this build"
        body={`Checkout needs a merchant account: set PAYBIS_API_KEY on the deploy and this modal opens the real widget for $${pack.price}. Until then the balance can still be moved, so the rest of the wallet stays worth looking at.`}
      >
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={onSimulate}
        >
          Add {pack.credits} credits without paying
        </Button>
      </Notice>
    );
  }

  return (
    <Notice
      tone="danger"
      title="Could not start the checkout"
      body="Paybis did not hand back a session. Nothing was charged — nothing had started."
    >
      <Button size="lg" variant="outline" className="w-full" onClick={retry}>
        Try again
      </Button>
    </Notice>
  );
}

/** The three non-widget states share a shape; only the words differ. */
function Notice({
  icon: Glyph = TriangleAlert,
  tone = "muted",
  title,
  body,
  children,
}) {
  return (
    <div className="rounded-card bg-canvas p-5 text-center">
      <span
        className={`mx-auto grid size-11 place-items-center rounded-full ${
          tone === "danger"
            ? "bg-danger-soft text-danger"
            : "bg-brand-soft text-brand"
        }`}
      >
        <Glyph className="size-5" strokeWidth={2.2} />
      </span>
      <p className="mt-3 text-[16px] font-bold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
        {body}
      </p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
