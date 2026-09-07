"use client";

import { ShieldAlert } from "lucide-react";
import { usePersistedFlag } from "@vezlist/shared/lib/persisted.js";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";

/**
 * The 18+ door. Nothing here is a legal control — it is the declaration an
 * adult site is expected to make, and the one screen that says what this site
 * is before you see any of it.
 *
 * It defaults to closed, which is also what the server renders, so the first
 * paint of a cold visit is the gate rather than a flash of the board. A
 * returning visitor's confirmation arrives a tick after hydration and the gate
 * disappears.
 *
 * The board stays mounted behind it so the page is still server-rendered, but
 * `inert` takes it out of the tab order and off the accessibility tree — a
 * gate you can tab straight past is decoration.
 */
export default function AgeGate({ children }) {
  const [confirmed, setConfirmed] = usePersistedFlag("vezlist:age-ok");

  return (
    <>
      {!confirmed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="age-gate-title"
          className="fixed inset-0 z-[3000] flex flex-col items-center justify-center overflow-y-auto bg-canvas px-6 py-10"
        >
          {/* Two brand washes rather than a flat ground: the door should feel
              like the front of something, not like an error page. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -top-24 size-[420px] rounded-full bg-brand/20 blur-[120px]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -right-24 size-[420px] rounded-full bg-brand-2/20 blur-[120px]"
          />

          <div className="relative w-full max-w-[420px] text-center">
            <span className="brand-gradient mx-auto grid size-[72px] place-items-center rounded-3xl text-[26px] font-extrabold tracking-tight text-on-brand shadow-pop">
              18+
            </span>

            <h1
              id="age-gate-title"
              className="mt-7 text-[27px] font-extrabold leading-tight tracking-tight text-ink"
            >
              This site is for adults
            </h1>

            <p className="mx-auto mt-3 max-w-[36ch] text-[15px] leading-relaxed text-muted">
              Vezlist Personals carries adult ads and status updates posted by
              members. Some of it is explicit.
            </p>

            <div className="mt-7 flex items-start gap-3 rounded-card border border-line bg-surface p-4 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <ShieldAlert className="size-5" strokeWidth={2.4} />
              </span>
              <p className="text-[13px] leading-relaxed text-muted">
                By entering you confirm you are{" "}
                <span className="font-semibold text-ink">18 or older</span> — or
                the age of majority where you live — and that adult material is
                legal there.
              </p>
            </div>

            {/* One primary action. Leaving is a link, and it goes somewhere
                real: the marketplace, which is a different origin. */}
            <button
              autoFocus
              onClick={() => setConfirmed(true)}
              className="brand-gradient mt-6 h-[52px] w-full rounded-2xl text-[16px] font-bold text-on-brand shadow-pop transition-transform hover:scale-[1.01] active:scale-[0.99]"
            >
              I am 18 or older — enter
            </button>

            <a
              href={MARKETPLACE_URL}
              className="mt-3 inline-block w-full rounded-2xl border border-line py-3.5 text-[15px] font-semibold text-muted transition-colors hover:border-ink/25 hover:text-ink"
            >
              Leave — take me to Vezlist
            </a>

            <p className="mt-6 text-[12px] leading-relaxed text-muted/80">
              This site is not indexed by search engines and is labelled for
              content-filtering software.
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
