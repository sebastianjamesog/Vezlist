"use client";

import { useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  Flag,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  UserRoundX,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { useShell } from "../components/layout/AppLayout";
import PageBody from "../components/layout/PageBody";
import Icon from "../components/ui/Icon";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ReportDialog from "../components/ReportDialog";
import { useToast } from "../context/ToastContext";
import { useReports } from "../context/ReportsContext";
import { ads } from "../data/mock";
import { categoryPath } from "../lib/taxonomy";
import { tones } from "../lib/tones";
import { FEED_PATH } from "../lib/sites";
import { usePersistedObject } from "../lib/persisted";
import MediaImage from "../components/media/MediaImage.jsx";
import PhotoMark from "../components/media/PhotoMark.jsx";
import {
  NO_REVEALS,
  REVEALS_KEY,
  REVEAL_LIMIT,
  SETTINGS_TOGGLES_KEY,
  canReveal,
  isRevealed,
  maskEmail,
  maskPhone,
  recordReveal,
  revealKey,
  showsEmail,
  showsPhone,
} from "../lib/listings";

const CARD = "rounded-card bg-surface p-4 shadow-card lg:p-6";

/**
 * The call button, as an anchor rather than a `<Button to=…>`.
 *
 * `Support.jsx` sets the rule the rest of the app follows: `to` is a Next link
 * and stays in the app, `href` on a plain `<a>` hands off to the device. A
 * `tel:` is a hand-off — it opens the dialler, not a route — so it must not go
 * through the router. The classes are `Button`'s primary/lg, spelled out here
 * because that component only renders a button or a Next link.
 */
const CALL =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl brand-gradient h-[52px] px-6 text-[16px] font-semibold text-on-brand shadow-pop transition-all duration-150 hover:brightness-110 active:scale-[0.98] active:brightness-95";

/**
 * The same trick one size down, for the button inside a contact row. `Button`'s
 * primary/sm, spelled out for the same reason `CALL` is: half the time this
 * renders as a `tel:` or `mailto:` hand-off, which has to be a plain `<a>`, and
 * a pill that changed shape when it changed from a button to a link would make
 * the row jump under the reader's thumb at the exact moment they tapped it.
 */
const PILL =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl brand-gradient px-3.5 text-[13px] font-semibold text-on-brand shadow-pop transition-all duration-150 hover:brightness-110 active:scale-[0.98] active:brightness-95";

/**
 * One contact channel — icon, the button that opens it, and as much of the
 * value as the reader has earned.
 *
 * One component called twice rather than a phone block and an email block
 * written out side by side, because the two are the same control over
 * different data and the pair that drifts is the pair that was copied. The
 * only thing either of them knows about its channel arrives as a prop.
 *
 * The order is deliberate and is not the order you would write the sentence
 * in: icon, *action*, then value. What the reader is deciding here is whether
 * to spend a reveal, so the tap target sits at a fixed x on every row and the
 * ragged half — a masked number, a masked address, then the real ones, which
 * are all different widths — is pushed to the end where it can be as ragged as
 * it likes.
 *
 * `value` is only ever passed through when `revealed`; before that this
 * renders `masked` and nothing else. Keeping the real thing in the markup and
 * covering it with CSS would put it one View Source away from anybody scraping
 * the board, which matters more for an address than it ever did for a number —
 * an email is the one of the two that can be harvested straight into a list.
 */
function ContactRow({
  channel,
  icon: ChannelIcon,
  masked,
  value,
  href,
  actionLabel,
  revealed,
  onReveal,
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <ChannelIcon className="size-[18px]" strokeWidth={2.4} />
      </span>

      {revealed ? (
        <a href={href} className={PILL}>
          {actionLabel}
          <span className="sr-only"> {channel}</span>
        </a>
      ) : (
        <button type="button" onClick={onReveal} className={PILL}>
          Show
          <span className="sr-only"> {channel}</span>
        </button>
      )}

      {/*
        `truncate` and not a wrap: a long address on a narrow phone would
        otherwise push the row to two lines and only one of the two rows would
        do it, which reads as a layout bug rather than as a long address. The
        full value is one tap away in the mail client either way.
      */}
      <span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-tight text-ink">
        <span className="sr-only">{channel}: </span>
        {revealed ? value : masked}
      </span>
    </div>
  );
}

/*
  Where the ad sits in the tree comes off the ad body itself.

  It was briefly read back off "the feed row whose `adId` points here", which
  looks reasonable and is wrong: every non-personals row in the mock borrows the
  same body, so that lookup returns whichever row sorts first and a Vehicles
  card opened onto "Home & Garden". The bodies carry their own `category` and
  optional `subcategory` now — which is what a real ad would do — and this route
  reads the ad it was asked for and nothing else.
*/

export default function AdDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openPost } = useShell();
  const toast = useToast();
  const { isBlocked, block, unblock, reportOf } = useReports();
  const ad = ads[id];
  const [active, setActive] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  /**
   * The seller's switch, and this reader's reveals.
   *
   * Both are read straight from storage rather than through a context: neither
   * is written from more than one screen (Settings owns the first, this page
   * owns the second), and the pure half of both lives in `lib/listings.js`
   * where it is tested. Until storage answers, both come back `null` and the
   * helpers fall through to the seed's defaults — which is what makes the
   * server's render and the first client render agree.
   */
  const [toggles] = usePersistedObject(SETTINGS_TOGGLES_KEY);
  const [reveals, setReveals] = usePersistedObject(REVEALS_KEY);

  /**
   * Open one channel on this ad.
   *
   * The channel is in the key, not just the ad, and that is what makes the two
   * rows cost a slot each out of one shared hourly budget — `REVEAL_LIMIT` in
   * `listings.js` carries the argument for why they share it rather than each
   * getting six of their own.
   *
   * `Date.now()` is read in the returned handler and handed to a pure reducer
   * — never during render, where the server and the client would disagree
   * about what the clock said. An unchanged state back means the hourly budget
   * is spent, and that is what the reader is told rather than a button that
   * quietly does nothing.
   *
   * A function that returns the handler rather than one the caller wraps in an
   * arrow, because that is the shape the impurity is legible in: `reveal(id)`
   * builds a handler and the clock is read inside it, where an event is the
   * only thing that can run it. Wrapped the other way round it reads as a
   * component-scope function that happens to touch the clock, which is a thing
   * this file should never contain and which the lint rightly says so about.
   */
  const reveal = (channel) => () => {
    const at = Date.now();
    const current = reveals ?? NO_REVEALS;
    const key = revealKey(id, channel);
    if (!canReveal(current, key, at)) {
      toast(
        `You've opened ${REVEAL_LIMIT} contact details in the last hour — try again later`,
      );
      return;
    }
    setReveals(recordReveal(current, key, at));
  };

  if (!ad) {
    return (
      <>
        <TopBar
          variant="detail"
          onBack={() => navigate(-1)}
          onPostAd={openPost}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            This ad is no longer available.
          </p>
          <Button to={FEED_PATH} variant="soft">
            Back to listings
          </Button>
        </div>
      </>
    );
  }

  const path = categoryPath(ad.category, ad.subcategory);

  /*
    Contact, which on this product means a phone number, an email address, and
    nothing else.

    There is no buyer–seller messaging here and none is planned (#2, closed
    not-planned) — the only two places anybody writes to anybody are the Live
    chat and a Support ticket. So these controls are not a convenience next to
    a Message button; they are the entire path from a reader to a seller, which
    is why they sit above the seller card rather than under it and why the
    mobile bar leads with one.

    Each channel is gated by the seller's own switch and by whether the ad
    actually carries the value — two independent facts, and both have to be
    true. Off means the value is not rendered, not hidden with CSS and not sent
    to the client masked: there is simply nothing on the page to reveal.

    Built as a list rather than two named booleans because everything
    downstream — the rows, the notes under them, the mobile bar — wants "the
    channels this ad has, in order" and not "does it have a phone". The order
    is phone first, which is the order the bottom bar inherits when it picks
    the one channel it has room for.
  */
  const mailHref = `mailto:${ad.email}?subject=${encodeURIComponent(ad.title)}`;
  // Spaces are for reading; a dialler wants the digits and the plus.
  const telHref = `tel:${(ad.phone ?? "").replace(/\s+/g, "")}`;

  const phoneShown = showsPhone(toggles) && Boolean(ad.phone);
  const emailShown = showsEmail(toggles) && Boolean(ad.email);

  const channels = [
    phoneShown && {
      id: "phone",
      channel: "phone number",
      icon: Phone,
      value: ad.phone,
      masked: maskPhone(ad.phone),
      href: telHref,
      actionLabel: "Call",
      showLabel: "Show number",
    },
    emailShown && {
      id: "email",
      channel: "email address",
      icon: Mail,
      value: ad.email,
      masked: maskEmail(ad.email),
      /*
        Pre-filled with the ad's title, which is the one thing the seller needs
        to know and the one thing a reader writing from a mail client will
        forget: a poster with four ads running gets "Re: 2012 Honda Accord"
        instead of an empty subject line and a guess.
      */
      href: mailHref,
      actionLabel: "Email",
      showLabel: "Show email",
    },
  ]
    .filter(Boolean)
    .map((c) => ({ ...c, revealed: isRevealed(reveals, revealKey(id, c.id)) }));

  /*
    What is said under the rows, assembled rather than written out per case,
    because the cases multiply: two channels, each published or not, each
    revealed or not. Three sentences, each of which is either true of this ad
    or absent — the previous copy claimed "there is no way to answer this ad"
    from the phone toggle alone, which stopped being true the moment a second
    channel existed.
  */
  const notes = [
    phoneShown &&
      !emailShown &&
      "This seller has not published an email address.",
    emailShown &&
      !phoneShown &&
      "This seller has not published a phone number.",
    channels.some((c) => !c.revealed) &&
      `${REVEAL_LIMIT} contact details an hour, per device — a number and an address cost one each.`,
    channels.some((c) => c.revealed) &&
      "This is how you reach a seller on Vezlist — there is no messaging here. Never send a deposit before you have seen the item.",
  ]
    .filter(Boolean)
    .join(" ");

  /*
    What the bottom bar leads with, which is the first channel this ad has.

    One slot, so it is a pick and not a list. Not for want of room — the bar
    holds one button now — but because a pinned bar is for the single most
    likely next action, and offering a reader two ways to open the same ad's
    contacts down there duplicates the card that already offers both, one
    thumb-length up the page. Phone first, because `channels` is built phone
    first and a call is the faster of the two.
  */
  const lead = channels[0] ?? null;
  const LeadIcon = lead?.icon ?? User;

  const blocked = isBlocked(ad.sellerId);
  const reported = reportOf("listing", id);

  /*
    Which photos have been checked, and whether that is worth saying out loud.

    `verifiedPhotoCount` counts from the front of `ad.photos` (the ad body
    explains why it is a count and not a flag per photo). Three cases fall out
    of it and only one of them splits the gallery. An ad nobody has checked
    shows the plain strip it has always shown. An ad where every photo passed
    shows one unlabelled strip under the banner, because a "Verified pictures"
    heading with nothing on the other side of it is a distinction that does not
    exist — the banner has already said it. Only the mixed ad gets two labelled
    groups, which is the one case where the reader has to be told which is which.
  */
  const verifiedPhotos = ad.verified ? (ad.verifiedPhotoCount ?? 0) : 0;
  const split = verifiedPhotos > 0 && verifiedPhotos < ad.photos.length;
  const groups = split
    ? [
        { label: "Verified pictures", from: 0, to: verifiedPhotos },
        {
          label: "Non-verified pictures",
          from: verifiedPhotos,
          to: ad.photos.length,
        },
      ]
    : [{ label: null, from: 0, to: ad.photos.length }];

  return (
    <>
      <TopBar
        variant="detail"
        title={ad.title}
        onBack={() => navigate(-1)}
        onPostAd={openPost}
      />

      <PageBody className="px-4 pb-6 lg:px-8 lg:py-8">
        {/*
          Mobile stacks in the order the mockup shows: gallery, summary,
          description, contact. Desktop keeps gallery + description in the left
          column and summary + contact in the right, via explicit grid placement
          so neither layout has to compromise the other's order.
        */}
        <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6">
          {/* 1 — gallery */}
          <section className="lg:col-start-1 lg:row-start-1">
            <div className="overflow-hidden rounded-card shadow-card">
              {/*
                The banner sits above the photos and not over them, because what
                it says is about the photos and a caption laid on top of one
                would read as being about that one.

                Solid emerald, filled. The competitor this is modelled on runs
                the same bar in magenta, which is its brand colour and would be
                a second accent here — this product is white and blue, and
                emerald is already what verified means on the feed card, the
                seller dot and the ring around a checked ad. Filled rather than
                tinted because it is the one line on the page making a claim on
                the platform's own behalf, and a pale strip reads as another
                piece of chrome.
              */}
              {ad.verified && (
                <p className="flex items-start gap-2 bg-emerald-600 px-4 py-2.5 text-[12px] leading-snug text-white lg:text-[13px]">
                  <BadgeCheck
                    className="size-[18px] shrink-0"
                    strokeWidth={2.5}
                  />
                  <span>
                    <span className="font-extrabold">Verified ad</span> — these
                    pictures have been confirmed as real by Vezlist.
                  </span>
                </p>
              )}

              <div className="relative h-64 lg:h-[440px]">
                <MediaImage
                  discreet
                  fill
                  preload
                  src={ad.photos[active]}
                  alt={ad.title}
                  sizes="(min-width: 1024px) 620px, 100vw"
                  className="object-cover"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/60 to-transparent" />

                {/* Sits above the scrim, not under it — the scrim is there to
                    make the badges over it readable, and a mark washed out by
                    the same gradient would be the one thing on the photo that
                    the gradient defeats. */}
                <PhotoMark
                  src={ad.photos[active]}
                  className="bottom-2.5 right-3 text-[13px] lg:text-[15px]"
                />

                {/*
                  Only on the ad whose gallery is actually split. The two
                  strips below say which group a thumbnail came from, but the
                  reader spends most of their time looking at this one big
                  image with the strips scrolled off — without this chip they
                  would have to go back and count to find out whether what they
                  are looking at was checked.

                  It used to have a "N photos" chip for company, and that chip
                  is gone from both boards, not just personals: the strip of
                  thumbnails immediately under this image *is* the count, laid
                  out so a reader can see it and tap into it, and a number
                  printed over the picture restated what they could already see
                  while covering part of what they came to look at. This chip
                  is positioned on its own now rather than through the flex row
                  the pair shared, so the unsplit ad renders nothing here at
                  all instead of an empty box floating over the photo.
                */}
                {split && (
                  <span
                    className={`absolute bottom-3 left-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm ${
                      active < verifiedPhotos
                        ? "bg-emerald-600/90"
                        : "bg-black/60"
                    }`}
                  >
                    {active < verifiedPhotos ? (
                      <>
                        <BadgeCheck className="size-3.5" strokeWidth={2.5} />
                        Verified
                      </>
                    ) : (
                      "Not verified"
                    )}
                  </span>
                )}

                {/*
                  Nothing in the top-right corner, and that is the change, not
                  an oversight.

                  A Share button and a Save heart used to float there. Both do
                  something *to* the reader rather than for them: Save writes
                  "this one" into a list that lives on this device and surfaces
                  in a profile screen anybody holding the phone can open, and
                  Share hands the ad — and by implication the reader's interest
                  in it — to whatever the OS sheet is pointed at, or onto a
                  clipboard every other app can read. Neither is a record or a
                  disclosure anybody asked to make, and both sat one mis-tap
                  from the photo the reader was actually trying to swipe.

                  Gone from both boards. On personals the argument is loudest —
                  the rest of that build leans the same way at every turn:
                  discreet mode blurs the photos until asked, blocked sellers
                  stay blocked, and there is no messaging to leave a trail in,
                  so the two most trail-leaving controls on the page were the
                  one place it stopped being careful — but a marketplace reader
                  is not served by an accidental record either, and one page
                  with two different sets of chrome is a page that drifts.

                  What stayed is what a reader deliberately reaches for: Report
                  and Block, under the seller card, quiet and labelled. The
                  saved-items feature itself is untouched; this page simply no
                  longer writes to it.
                */}
              </div>
            </div>

            {/*
              One strip per group, each under its own heading. The unsplit ad
              gets a single group with no label, so it renders the same bare
              strip it did before this existed rather than growing a heading
              that answers a question nobody asked it.

              Indices stay absolute — `from + i` — because `active` indexes
              `ad.photos`, not the group. Re-basing per group would give the
              first non-verified thumbnail the index 0 and open the first
              verified photo instead.
            */}
            {groups.map((g) => (
              <div key={g.label ?? "all"}>
                {g.label && (
                  <h2 className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                    {g.from === 0 && (
                      <BadgeCheck
                        className="size-4 text-emerald-600"
                        strokeWidth={2.5}
                      />
                    )}
                    {g.label}
                  </h2>
                )}
                <div
                  className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 ${g.label ? "" : "mt-3"}`}
                >
                  {ad.photos.slice(g.from, g.to).map((src, i) => (
                    <button
                      key={src}
                      onClick={() => setActive(g.from + i)}
                      aria-label={`Photo ${g.from + i + 1}`}
                      aria-current={g.from + i === active}
                      className={`relative size-16 shrink-0 overflow-hidden rounded-2xl transition-all lg:size-20 ${
                        g.from + i === active
                          ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas"
                          : "opacity-70 hover:opacity-100"
                      }`}
                    >
                      <MediaImage
                        discreet
                        fill
                        src={src}
                        alt=""
                        sizes="(min-width: 1024px) 80px, 64px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* 2 — title, price, overview */}
          <section
            className={`mt-4 lg:col-start-2 lg:row-start-1 lg:mt-0 ${CARD}`}
          >
            {/*
              Above the title, not down in the location row: the path answers
              "what am I looking at" and belongs before the answer, whereas the
              row underneath is where and when. It is plain text with the
              chevron in it rather than two chips, so an ad with no
              sub-category loses a word instead of losing a component.
            */}
            {path && (
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                {path}
              </p>
            )}
            <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-[26px]">
              {ad.title}
            </h1>

            <p className="mt-2 text-[30px] font-extrabold tabular-nums text-brand">
              ${ad.price.toLocaleString()}
            </p>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 font-semibold">
                <MapPin className="size-3.5" />
                {ad.location}
              </span>
              {/*
                Posted and viewed read as one sentence, not two facts on
                separate lines. Neither half means much alone: twelve thousand
                views is remarkable in an hour and dismal in a year, and "posted
                four minutes ago" says nothing about whether anyone came.

                Printed in full here and rounded on the feed card. A card is
                comparing rows and only needs the order of magnitude; someone
                who has opened the ad is weighing this one ad, and the exact
                figure is what a count is for. The locale is pinned because this
                page prerenders — the build machine's separator is not the
                reader's, and React discards a tree whose two renders disagree.
              */}
              <span>
                {ad.postedLabel}
                {ad.views != null &&
                  ` — Viewed ${ad.views.toLocaleString("en-US")} times`}
              </span>
            </p>

            <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {ad.overviewTitle}
            </h2>
            {/*
              Two shapes for the same section, and the body picks which by
              carrying `specs` or `details`. Four vehicle facts want the icon
              tiles: a coloured chip each, read as a set of highlights. The ten
              a personals post carries do not — colour on every row distinguishes
              nothing, and the tiles' padding turns a short reference table into
              a screenful. Nobody scans for eye colour; they go looking for it,
              and a label/value table is what you look things up in.
            */}
            {ad.details?.length > 0 && (
              <dl className="divide-y divide-line">
                {ad.details.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                  >
                    <dt className="shrink-0 text-[13px] font-semibold text-muted">
                      {d.label}
                    </dt>
                    <dd className="min-w-0 truncate text-right text-[14px] font-bold text-ink">
                      {d.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {ad.specs?.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {ad.specs.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-3 rounded-2xl bg-canvas p-3"
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-xl ${tones[s.tone]}`}
                    >
                      <Icon
                        name={s.icon}
                        className="size-[18px]"
                        strokeWidth={2.5}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                        {s.label}
                      </span>
                      <span className="block truncate text-[14px] font-bold text-ink">
                        {s.value}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3 — description */}
          <section
            className={`mt-4 lg:col-start-1 lg:row-start-2 lg:mt-0 ${CARD}`}
          >
            <h2 className="text-[18px] font-extrabold text-ink">Description</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink/75">
              {ad.description.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>

          {/* 4 — contact, then who you would be contacting. */}
          <div className="lg:col-start-2 lg:row-start-2 lg:space-y-6">
            <section className={`mt-4 lg:mt-0 ${CARD}`}>
              <h2 className="text-[18px] font-extrabold text-ink">
                Contact the seller
              </h2>
              {channels.length > 0 ? (
                <>
                  {/*
                    One row per published channel, from one component — see
                    `ContactRow`. Masked until asked for, and each mask keeps
                    the half that helps a reader decide whether this contact is
                    worth one of the six an hour: the dialling code and area on
                    a number, the domain on an address.
                  */}
                  {channels.map((c) => (
                    <ContactRow
                      key={c.id}
                      channel={c.channel}
                      icon={c.icon}
                      masked={c.masked}
                      value={c.value}
                      href={c.href}
                      actionLabel={c.actionLabel}
                      revealed={c.revealed}
                      onReveal={reveal(c.id)}
                    />
                  ))}

                  <p className="mt-3 text-[13px] leading-snug text-muted">
                    {notes}
                  </p>
                </>
              ) : (
                /*
                  The honest empty state, and it is only reached now when
                  *both* switches are off. Not a disabled button and not a
                  "request contact" form that would go nowhere — the seller
                  published no way to be reached, and there is nothing here for
                  a reader to do about it. The half-published cases are not
                  empty states at all: they render the channel that exists and
                  say plainly, in `notes`, which one does not.
                */
                <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
                  This seller has published neither a phone number nor an email
                  address. There is no messaging on Vezlist, so this ad has no
                  way to be answered — their other ads may.
                </p>
              )}
            </section>

            <section className={`mt-4 lg:mt-0 ${CARD}`}>
              <h2 className="text-[18px] font-extrabold text-ink">Seller</h2>

              <Link
                href={`/seller/${ad.sellerId}`}
                className="group mt-3 flex items-center gap-3 rounded-2xl bg-canvas p-3 transition-colors hover:bg-brand-soft"
              >
                <span className="relative shrink-0">
                  <MediaImage
                    src={ad.seller.avatar}
                    alt={ad.seller.name}
                    width={48}
                    height={48}
                    className="size-12 rounded-2xl object-cover"
                  />
                  {ad.seller.online && (
                    <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-canvas bg-emerald-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold text-ink group-hover:text-brand">
                    {ad.seller.name}
                  </span>
                  <span className="block text-[12px] text-muted">
                    Member since {ad.seller.since} · View profile
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  <ShieldCheck className="size-3.5" />
                  {ad.seller.badge}
                </span>
              </Link>

              {/*
                Under the seller card, which is exactly where the FAQ has been
                telling people to look for years — "open the ad, tap the seller
                card, then Report" described a control that did not exist, and
                the answer in `mock.js` has been rewritten alongside this to
                match what now ships.

                Quiet on purpose: two text buttons, not two filled ones. A
                report control that shouts is a report control that gets tapped
                by mistake, and every false report costs a moderator the same
                as a real one.
              */}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3.5">
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="flex items-center gap-1.5 text-[13.5px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  <Flag className="size-4" strokeWidth={2.2} />
                  {reported ? "Reported" : "Report ad"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (blocked) {
                      unblock(ad.sellerId);
                      toast(`${ad.seller.name} unblocked`);
                    } else {
                      setConfirmBlock(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 text-[13.5px] font-semibold transition-colors ${
                    blocked ? "text-brand" : "text-muted hover:text-danger"
                  }`}
                >
                  <UserRoundX className="size-4" strokeWidth={2.2} />
                  {blocked ? "Unblock seller" : "Block seller"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </PageBody>

      {/*
        Mobile pins the one thing you actually came to do to the bottom.

        The button used to be "View seller", which is a navigation rather than
        an action — it was the primary call to action on the page by default,
        because reaching a seller was not something the page could do. Now that
        it is, the lead channel takes the slot and the profile is a tap away on
        the card above. When the seller published no channel at all there is
        nothing to put here, so the old link comes back rather than a disabled
        button making a promise the ad cannot keep.

        It used to share the bar with an outlined Save, which is why the
        primary carried `flex-[1.6]` — a ratio that only ever meant "wider than
        the thing beside it". Save is gone from both boards (see the seller
        card's Report and Block for the controls that stayed and why), so the
        one button left takes the whole width in all three of its states rather
        than stopping short of the edge for a neighbour that is not there. The
        row stays a flex row: it is still the thing that gives the button its
        width, and a second action arriving later drops back in beside it.
      */}
      <div className="glass shrink-0 border-t border-line px-4 pb-nav pt-3 lg:hidden">
        <div className="flex gap-2.5">
          {!lead ? (
            <Link
              href={`/seller/${ad.sellerId}`}
              className="brand-gradient flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-on-brand shadow-pop transition-transform active:scale-[0.98]"
            >
              <User className="size-5" />
              View seller
            </Link>
          ) : lead.revealed ? (
            <a href={lead.href} className={`${CALL} flex-1`}>
              <LeadIcon className="size-5" />
              {lead.actionLabel}
            </a>
          ) : (
            <Button size="lg" className="flex-1" onClick={reveal(lead.id)}>
              <LeadIcon className="size-5" />
              {lead.showLabel}
            </Button>
          )}
        </div>
      </div>

      <ReportDialog
        open={reporting}
        targetType="listing"
        targetId={id}
        targetLabel={ad.title}
        onClose={() => setReporting(false)}
      />

      <ConfirmDialog
        open={confirmBlock}
        title={`Block ${ad.seller.name}?`}
        body="Their ads stop appearing in your feed on this device. It takes effect straight away and you can undo it from their profile or from Account Settings. Blocking is not a report — if this ad is against the rules, report it too."
        confirmLabel="Block"
        destructive
        onConfirm={() => {
          setConfirmBlock(false);
          block(ad.sellerId, ad.seller.name);
          toast(`${ad.seller.name} blocked — their ads are hidden`);
        }}
        onClose={() => setConfirmBlock(false)}
      />
    </>
  );
}
