"use client";

import { Camera, ChevronRight, Radio, SquarePlus, X } from "lucide-react";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { useNavigate } from "../../lib/nav";
import { IS_PERSONALS } from "../../lib/sites";
import { useToast } from "../../context/ToastContext";
import { useAccount } from "../../context/AccountContext";

/**
 * Whether the plus opens a chooser at all, on this build.
 *
 * Live and stories are personals concepts. The marketplace sells objects, and
 * an object does not go live or post a story about its weekend — so on that
 * build there is exactly one thing the plus could ever mean, and a menu with
 * one row is a tap charged for nothing. The shell reads this and either opens
 * the chooser or opens the ad wizard directly; the rule lives here, next to the
 * rows it governs, so the shell never has to know which rows exist.
 */
export const HAS_CREATE_MENU = IS_PERSONALS;

/**
 * The three things the plus can mean, in the order they are offered.
 *
 * Post an ad is first because it is the one that works end to end and the one
 * both boards share. The other two are personals-only, and neither has a
 * backend behind it — see the note on `refuse` below for what happens when they
 * are pressed, and why that is the honest end state rather than a placeholder
 * screen that mimes broadcasting.
 *
 * `cap` is the capability the account needs before the feature is even a
 * question. `nudge` is what a browsing account is told instead: never a dead
 * button and never a bare "no", always the sentence that names the way in.
 */
const OPTIONS = [
  {
    id: "ad",
    Icon: SquarePlus,
    label: "Post an ad",
    blurb: "Photos, details and how people reach you.",
  },
  {
    id: "live",
    Icon: Radio,
    label: "Go live",
    blurb: "Broadcast to the board and take replies as they come.",
    personals: true,
    cap: "live.host",
    to: "/live/start",
    nudge: "Switch to an ads creator account to go live",
  },
  {
    id: "story",
    Icon: Camera,
    label: "Add a story",
    blurb: "A photo on your profile ring that clears after 24 hours.",
    personals: true,
    cap: "status.post",
    nudge: "Switch to an ads creator account to post a story",
  },
];

/** One row: an icon tile, the name of the thing, and one line about it. */
function Option({ Icon, label, blurb, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-card border border-line bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-card active:scale-[0.98]"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Icon className="size-[22px]" strokeWidth={2.2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{label}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">
          {blurb}
        </span>
      </span>

      <ChevronRight className="size-4 shrink-0 text-muted" strokeWidth={2.4} />
    </button>
  );
}

/**
 * What the plus opens before the wizard does.
 *
 * The tab bar used to drop you straight into a four-step ad form, which made
 * the plus mean one thing on a board where it means three. This sits in front
 * of it: a bottom sheet on the phone, a centred dialog from lg, wearing the
 * same header, the same rounded-sheet corners and the same scrim as
 * `CreateAdSheet` so the two read as one flow rather than two components that
 * happened to meet.
 *
 * It does not own the wizard. Picking "Post an ad" closes this and calls back
 * up to the shell, which is still the one door into the create sheet and still
 * the one place that decides whether the account may walk through it — nothing
 * about the draft, the object URLs it holds or the "Draft saved" toast changes
 * because a menu now sits in front.
 *
 * The other two rows go somewhere now. Live opens the broadcaster screen at
 * `/live/start` — a real route outside the shell, because a viewfinder with a
 * tab bar under it is not a viewfinder — and Story opens the composer the
 * shell hosts beside the ad wizard. Both still ask the capability question
 * first, and an account that does not hold it gets the sentence naming the
 * account type that does rather than a dead row.
 */
export default function CreateMenu({ open, onClose, onPostAd, onAddStory }) {
  const toast = useToast();
  const { can } = useAccount();
  const navigate = useNavigate();

  // Escape closes, the same way it closes the wizard behind it — and now the
  // rest of it arrives from the same place the sheets get it: focus moves in on
  // open, Tab cycles the rows and the close button rather than walking out into
  // the board behind, and closing hands focus back to the plus. Bound only
  // while it is up, so this and the wizard never both answer the one keypress.
  //
  // It shares the hook rather than the component. Folding this onto `Modal`
  // would bring `Modal`'s chrome with it: a 24px title on the left, the close
  // button on the right, `rounded-t-sheet`, a drag handle, a different scrim.
  // This wears `CreateAdSheet`'s header on purpose — close on the left, title
  // centred — because picking "Post an ad" opens that wizard in the same corner
  // of the same stack and the two are meant to read as one flow. The focus
  // handling was the part that was missing; the markup was already decided.
  const ref = useDialogFocus(open, onClose);

  if (!open) return null;

  function choose(option) {
    if (option.id === "ad") {
      // Close first: the wizard renders in the same corner of the same stack,
      // and two sheets alive at once would fight over the scrim.
      onClose();
      onPostAd();
      return;
    }

    // The capability question is asked before the navigation, not after it: a
    // browsing account should never watch a broadcaster screen mount and then
    // be told it may not broadcast.
    if (!can(option.cap)) {
      onClose();
      toast(option.nudge);
      return;
    }

    onClose();
    if (option.to) navigate(option.to);
    else onAddStory();
  }

  const options = OPTIONS.filter((o) => !o.personals || IS_PERSONALS);

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-[1000] flex flex-col justify-end pb-nav lg:fixed lg:items-center lg:justify-center lg:p-8 lg:pb-8"
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create something"
        // Focusable, never a tab stop: opening lands here so the chooser reads
        // its own name, and the cycle then runs over the rows only.
        tabIndex={-1}
        className="relative flex w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl outline-none lg:max-w-md lg:rounded-3xl"
      >
        <header className="shrink-0 border-b border-line bg-surface">
          <div className="flex items-center gap-2 px-2 py-2">
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-canvas active:scale-95"
            >
              <X className="size-5" />
            </button>

            <p className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-ink">
              Create
            </p>

            {/* Balances the close button so the title sits on the centre line
                rather than half a button off it, the way the wizard's header
                is balanced by its step counter. */}
            <span aria-hidden="true" className="size-10 shrink-0" />
          </div>
        </header>

        <div className="flex flex-col gap-2 px-4 py-4 lg:px-6">
          {options.map((option) => (
            <Option
              key={option.id}
              Icon={option.Icon}
              label={option.label}
              blurb={option.blurb}
              onClick={() => choose(option)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
