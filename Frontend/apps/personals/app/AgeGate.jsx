"use client";

import { useEffect, useState } from "react";
import { EyeOff, ShieldAlert, SlidersHorizontal } from "lucide-react";
import Wordmark from "@vezlist/shared/components/layout/Wordmark.jsx";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";
import { MIN_AGE } from "@vezlist/shared/lib/age.js";

/**
 * What is behind the door, in the order it matters: the rating, then the two
 * things people actually want to know before they commit to a site like this.
 */
const TERMS = [
  {
    Icon: ShieldAlert,
    title: "18 or older",
    body: "Or the age of majority where you live, and adult material is legal there.",
  },
  {
    Icon: EyeOff,
    title: "Not indexed",
    body: "No search engines, and labelled for content-filtering software.",
  },
  {
    Icon: SlidersHorizontal,
    title: "Discreet mode",
    body: "Blur every photo on the board with one tap, any time.",
  },
];

/** A new document asks again; client-side navigation keeps this layout mounted. */
export default function AgeGate({ children }) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.ageGate = confirmed ? "ok" : "gate";
  }, [confirmed]);

  return (
    <>
      {!confirmed && (
        <div
          id="age-gate-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="age-gate-title"
          className="fixed inset-0 z-[3000] overflow-y-auto bg-canvas px-5 py-10"
        >
          {/* Two brand washes rather than a flat ground: the door should feel
              like the front of something, not like an error page. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-32 size-[26rem] rounded-full bg-brand/25 blur-3xl"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -right-24 size-[24rem] rounded-full bg-brand-2/25 blur-3xl"
          />

          <div className="relative mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center">
            <div className="glass rounded-sheet p-6 shadow-lift ring-1 ring-white/60">
              {/* Who is asking, and what the answer is about: the wordmark and
                  the rating share the top line so neither needs a caption. */}
              <div className="flex items-center justify-between gap-3">
                <Wordmark />
                <span className="brand-gradient grid h-9 shrink-0 place-items-center rounded-full px-3.5 text-[14px] font-extrabold tracking-tight text-on-brand shadow-pop">
                  {MIN_AGE}+
                </span>
              </div>

              <h1
                id="age-gate-title"
                className="mt-6 text-[28px] font-extrabold leading-tight text-ink"
              >
                This site is for adults
              </h1>

              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                Personals carries adult ads and stories posted by members. Some
                of it is explicit.
              </p>

              <ul className="mt-6 space-y-3">
                {TERMS.map(({ Icon, title, body }) => (
                  <li
                    key={title}
                    className="flex gap-3 rounded-card bg-surface/70 p-3.5 ring-1 ring-line"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="size-[18px]" strokeWidth={2.3} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold text-ink">
                        {title}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                        {body}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {/* The click is the declaration, so the button carries it. A
                  bare "Enter" beside the heading would leave what is being
                  confirmed to inference, which is the one thing a door like
                  this cannot leave to inference.

                  One primary action. Leaving is a link below, and it goes
                  somewhere real: the marketplace, a different origin. */}
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmed(true)}
                className="brand-gradient mt-6 h-[52px] w-full rounded-2xl text-[16px] font-bold text-on-brand shadow-pop transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                I am {MIN_AGE} or older — Enter
              </button>

              <a
                href={MARKETPLACE_URL}
                className="mt-3 block w-full rounded-2xl border border-line bg-surface py-3.5 text-center text-[15px] font-semibold text-muted transition-colors hover:border-ink/25 hover:text-ink"
              >
                Leave — take me to Vezlist
              </a>
            </div>

            <p className="mt-5 text-center text-[12px] leading-relaxed text-muted">
              Entering confirms you are {MIN_AGE} or older for this visit.
            </p>
          </div>
        </div>
      )}

      <div className="contents" inert={!confirmed}>
        {children}
      </div>
    </>
  );
}
