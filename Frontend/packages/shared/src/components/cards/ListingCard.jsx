"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Eye, Heart, MapPin } from "lucide-react";
import { compactCount, timeAgo } from "../../lib/format";
import MediaImage from "../media/MediaImage.jsx";
import PhotoMark from "../media/PhotoMark.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSaved } from "../../context/SavedContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";

/**
 * Row tile: photo left, three lines of text right, a chevron on the end.
 * The feed is one column on mobile and two or three wide, so the row stays
 * scannable at every width.
 *
 * The photo is the biggest thing on the card on purpose. It was a 72px
 * thumbnail, which on a phone is too small to tell one car from another — and
 * the photo is the first thing anyone reads on a classifieds row, ahead of the
 * title. At 96px it is something you can actually look at, and it sets the
 * card's height rather than being set by it.
 *
 * There are no Hot, Featured or Boosted flags. They marked a listing as worth
 * more attention than the one under it, which is a claim the feed cannot back:
 * "Hot" only meant posted in the last six hours, and "Featured" only meant
 * first in the list, so the badge moved every time the sort changed. The one
 * badge left is Verified, which says something checkable about the seller.
 *
 * Verified ads carry the travelling emerald ring; the pill on the seller line
 * names it for anyone who can't see the animation (reduced motion freezes it to
 * a hairline).
 *
 * One card serves both boards. The personals-only fields — `age`, `ethnicity` —
 * are guarded on the field being there rather than on `IS_PERSONALS`, because
 * the site flag is a fact about the bundle and this is a question about the row:
 * a saved-items list or a seller profile can hold rows from either board, and a
 * card that asked the bundle would render an age for a dining table.
 */
export default function ListingCard({ listing, chevron = false }) {
  const verified = listing.verified;
  // Real rows carry `id` (the backend UUID); rows still fed from the mock
  // (`data/mock.js`) carry `adId` instead, since every non-personals mock
  // row shares one of two bodies. Either one is what the detail page and
  // the save toggle need to identify this listing.
  const targetId = listing.id ?? listing.adId;
  const { signedIn } = useAuth();
  const { isSaved, toggle } = useSaved();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const saved = isSaved(targetId);

  function onToggleSave(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      toast("Sign in to save ads");
      return;
    }
    if (pending) return;
    setPending(true);
    toggle(targetId)
      .catch(() => toast("Couldn't update saved ads — try again"))
      .finally(() => setPending(false));
  }

  return (
    <Link
      href={`/ad/${targetId}`}
      className={`group relative flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99] lg:gap-4 lg:p-4 ${
        verified ? "verified-glow" : ""
      }`}
    >
      <div className="relative size-[96px] shrink-0 overflow-hidden rounded-xl ring-1 ring-line lg:size-[112px]">
        <MediaImage
          discreet
          fill
          src={listing.image}
          alt={listing.title}
          sizes="(min-width: 1024px) 112px, 96px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Smaller and tighter into the corner than the detail page's, because
            96px of thumbnail is mostly subject and the mark has to stay a
            footnote on it rather than becoming a third of what you can see. */}
        <PhotoMark
          src={listing.image}
          className="bottom-1 right-1.5 text-[8px]"
        />
        <button
          type="button"
          onClick={onToggleSave}
          disabled={pending}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save this ad"}
          className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-transform active:scale-90"
        >
          <Heart
            className={`size-4 ${saved ? "fill-current text-rose-400" : ""}`}
            strokeWidth={2.2}
          />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        {/* Two lines are reserved whether the title fills them or not: a
            stack of rows that each size to their own title reads as ragged,
            and everything below then sits at a different height on every one. */}
        <h3 className="line-clamp-2 min-h-[42px] text-[17px] font-bold leading-tight text-ink transition-colors group-hover:text-brand">
          {listing.title}
        </h3>

        {/*
          Who posted it, and — on personals — how old they are. The age rides
          directly after the name with nothing between them, which is why the
          name is not `flex-1`: a growing name box would leave the two ends of
          "Marina V." and "28" at opposite sides of the card, reading as two
          unrelated facts rather than one person.

          The Verified pill lives on this line and not out in the right-hand
          rail, where the bare icon used to sit. Two reasons. It is a claim about
          the seller, and the seller's name is here — floating free on the end of
          the card it described nothing in particular. And the rail is a reserved
          column every row pays for, verified or not: a 22px icon was affordable,
          a 22px icon plus the word "Verified" is about 75px off the title of
          every plain listing in the feed. Inline, the pill costs width only on
          the ads that earned it.

          The row's height is reserved for the same reason the title's is. The
          pill is taller than the text beside it, so without a floor a verified
          row would stand a few pixels taller than the plain one under it and the
          feed's rhythm would break on exactly the rows meant to look best.
        */}
        <div className="mt-1 flex min-h-[22px] items-center gap-1.5">
          <p className="min-w-0 truncate text-[12px] font-medium text-muted lg:text-[13px]">
            {listing.business}
          </p>
          {listing.age != null && (
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-ink lg:text-[13px]">
              {listing.age}
            </span>
          )}
          {verified && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-100 py-0.5 pl-1 pr-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              <BadgeCheck className="size-3" strokeWidth={2.5} />
              Verified
            </span>
          )}
          <span className="ml-auto shrink-0 pl-1 text-[11px] text-muted lg:text-[12px]">
            {timeAgo(listing.postedMsAgo)}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5 lg:mt-3">
          {listing.price > 0 && (
            <span className="inline-flex h-[22px] shrink-0 items-center rounded-lg bg-brand-soft px-2 text-[13px] font-bold tabular-nums text-brand">
              ${listing.price.toLocaleString()}
            </span>
          )}
          {/*
            Ethnicity takes the category's slot on a personals row rather than
            being added beside it. The category there is the string "Personals"
            on every single post — it is the board the reader is already
            standing on, so it spends width to tell them where they are, while
            the chip that replaces it says something about the post. It is a
            chip and not plain text because it reads as a facet you could have
            filtered by, which on that board you can.
          */}
          {listing.ethnicity ? (
            <span className="inline-flex h-[22px] min-w-0 items-center rounded-md bg-canvas px-1.5 text-[11px] font-medium text-muted lg:text-[12px]">
              <span className="truncate">{listing.ethnicity}</span>
            </span>
          ) : (
            <span className="shrink-0 truncate text-[12px] font-medium leading-[22px] text-muted lg:text-[13px]">
              {listing.category}
            </span>
          )}
          <span className="shrink-0 text-[12px] leading-[22px] text-muted">
            ·
          </span>
          {/* The only shrinkable item on the line, so a long place name gives
              way before the price or the category does. */}
          <span className="inline-flex h-[22px] min-w-0 items-center gap-0.5 rounded-md bg-canvas px-1.5 text-[11px] font-medium text-muted lg:text-[12px]">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{listing.location}</span>
          </span>
          {/*
            The view count is an icon and a number, not "1.2K views". The word
            is the same on every row in the feed, so it carries no information
            and costs about as much width as the price chip; the eye says it
            once, and the screen reader still gets the noun.

            Rounded through `compactCount` for the same reason it is rounded in
            the live header: nobody reads a listing because it has 1,214 views
            rather than 1,190, and the exact figure makes each row a different
            width. The detail page prints it in full, where the difference
            between a day-old ad and a dead one is worth the digits.
          */}
          {listing.views != null && (
            <span className="ml-auto inline-flex h-[22px] shrink-0 items-center gap-0.5 pl-1 text-[11px] font-medium tabular-nums text-muted lg:text-[12px]">
              <Eye className="size-3 shrink-0" />
              {compactCount(listing.views)}
              <span className="sr-only">views</span>
            </span>
          )}
        </div>
      </div>

      {/* The way in. It used to share a rail with the verified badge on a
          reserved line above it; with the badge moved inline there is one thing
          left out here, and it centres against the card's full height. A row
          without a chevron drops the column entirely and keeps the width for
          its title. */}
      {chevron && (
        <ChevronRight
          aria-hidden="true"
          className="my-auto size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        />
      )}
    </Link>
  );
}
