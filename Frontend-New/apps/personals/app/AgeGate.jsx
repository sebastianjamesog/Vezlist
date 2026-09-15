"use client";

import { useEffect } from "react";
import { EyeOff, ShieldAlert, SlidersHorizontal } from "lucide-react";
import Wordmark from "@vezlist/shared/components/layout/Wordmark.jsx";
import { MARKETPLACE_URL } from "@vezlist/shared/lib/sites.js";
import { usePersistedObject } from "@vezlist/shared/lib/persisted.js";
import { MIN_AGE, isConfirmedAdult } from "@vezlist/shared/lib/age.js";

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

/**
 * localStorage key the confirmation is stored under. Versioned (`:v1`) the
 * same way every other `usePersisted*` caller is — see `readWithMigration` in
 * lib/persisted.js — so a later change to the stored shape can tell "nothing
 * stored" apart from "stored under a shape this build no longer reads",
 * rather than crashing on or silently misreading it.
 *
 * Kept in sync by hand with the literal of the same name in ./layout.jsx's
 * pre-hydration script, which cannot import this module — see that file for
 * why, and for the mechanism this key feeds on both sides.
 */
export const AGE_GATE_STORAGE_KEY = "vezlist:age-gate:v1";

/**
 * The 18+ door. Not a legal control — no ID is uploaded or checked against
 * anything (that is issue #13's territory, and there is no upload/storage
 * pipeline here to receive one), and no jurisdiction is blocked (that is edge
 * config, not app code) — but it is the declaration an adult site is expected
 * to make, and it remembers the answer instead of asking again on every visit.
 *
 * WHAT IS STORED: `{ confirmed: true }` under `AGE_GATE_STORAGE_KEY`, in this
 * origin's localStorage. One boolean — not a name, not an id, not a birth
 * date, nothing resembling identity.
 *
 * WHAT THAT COSTS, SAID PLAINLY: this door used to ask for a date of birth and
 * recompute the age from it on every read, so a value hand-edited in devtools
 * to `{ confirmed: true }` was refused. It is now the whole answer, and one
 * edited value opens the door. That is a deliberate trade — a birth-date field
 * is friction on the front step of a board whose ads are the product, and it
 * was never verified against anything either, so what it really bought was a
 * higher bar for the same unverified claim rather than a different kind of
 * claim. `isConfirmedAdult` still fails closed on every shape that is not
 * exactly this one, and real identity verification is still a server's job and
 * still out of scope (#13). If it arrives, it replaces this, not the field.
 *
 * THE FLASH, IN BOTH DIRECTIONS, AND HOW IT IS AVOIDED:
 *
 * `usePersistedObject` (lib/persisted.js) starts every mount at its fallback
 * — `null` here — because the server has no localStorage to read, and the
 * first client render has to match the server's output or React discards the
 * tree as a hydration mismatch. The stored value only arrives a tick later,
 * from a `useEffect`. That default direction is exactly the safe one for this
 * gate: `null` decodes to "not confirmed", so an unconfirmed visitor's first
 * paint is already the gate, in front of an `inert` board — nothing behind it
 * is ever the first thing painted. That half needs no extra work.
 *
 * The other direction is the hazard, and it is the same shape `useDiscreet.js`
 * documents for the discreet-mode blur, just mirrored: a *confirmed* returning
 * visitor would, for that same one tick, see the gate they already answered
 * flash in front of the board before the stored value catches up and this
 * component removes it. Discreet mode's fix is a `beforeInteractive` inline
 * script in layout.jsx that reads localStorage synchronously, ahead of
 * hydration, and sets a `data-*` attribute a CSS rule reacts to immediately —
 * so the correct visual state is on screen at the very first paint, before
 * React has run at all. The age gate uses the identical mechanism: layout.jsx
 * carries a duplicate, inline copy of this file's leap-year/timezone-safe age
 * check (it cannot `import` this module into a literal script string), and if
 * a stored value passes it, sets `data-age-gate="ok"` on `<html>` before this
 * component ever renders. A small inline stylesheet in layout.jsx hides
 * `#age-gate-overlay` whenever that attribute is present. React's own state
 * still starts at "not confirmed" underneath — no hydration mismatch, the
 * overlay is still in the DOM for that first tick — it is just not visible,
 * and the `useEffect` below re-derives the *real* answer from
 * `isConfirmedAdult` and writes the same attribute again once it is sure,
 * closing the gap between the inline script's guess and the true state. A gap
 * between the two costs at most one tick of the wrong CSS value; it can never
 * let anyone bypass anything, because `inert` on the board is still driven by
 * React's own `confirmed`, computed the same way regardless of what the
 * pre-hydration script guessed.
 *
 * Navigating inside the app does not re-prompt, and that costs nothing to
 * arrange: this sits in the root layout, above the router outlet, and Next
 * keeps the root layout mounted across every client-side navigation.
 *
 * The board stays mounted behind it so the page is still server-rendered, but
 * `inert` takes it out of the tab order and off the accessibility tree — a
 * gate you can tab straight past is decoration.
 *
 * It is built like the sign-in screen on purpose: same lit canvas, same frosted
 * card. This is the front door of the same product, and a door that looks like
 * a browser warning makes the site behind it look like one too.
 */
export default function AgeGate({ children }) {
  const [stored, setStored, loaded] = usePersistedObject(AGE_GATE_STORAGE_KEY);
  const confirmed = isConfirmedAdult(stored);

  // Keeps `<html data-age-gate>` in step with the real, revalidated answer
  // once React has taken over — see the mechanism note above. Skipped until
  // `loaded`, so this never writes the fallback's "not confirmed" over a
  // value the pre-hydration script already got right, on the one render
  // before the stored value has actually been read.
  useEffect(() => {
    if (!loaded) return;
    document.documentElement.dataset.ageGate = confirmed ? "ok" : "gate";
  }, [confirmed, loaded]);

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
                onClick={() => setStored({ confirmed: true })}
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
              Entering confirms you are {MIN_AGE} or older. Nothing else is
              stored, and you can leave at any time.
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
