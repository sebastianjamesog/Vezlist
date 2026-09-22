import { ethnicities } from "../data/mock.js";
import { IS_PERSONALS } from "./sites.js";
import { arrayOf, isNonEmptyString, isObject, isString } from "./guards.js";

export const MAX_IMAGES = 6;

export const STEPS = [
  {
    id: "photos",
    short: "Photos",
    title: "New ad",
    heading: "Add photos",
    sub: "The first photo becomes the cover buyers see in the feed.",
    cta: "Next",
  },
  {
    id: "details",
    short: "Details",
    title: "Details",
    heading: "Describe your ad",
    sub: "A clear title and honest description get more replies.",
    cta: "Next",
  },
  {
    id: "contact",
    short: "Contact",
    title: "Contact",
    heading: "Where and how to reach you",
    sub: "Buyers only see what you choose to share here.",
    cta: "Next",
  },
  {
    id: "review",
    short: "Review",
    title: "Review",
    heading: "Check it over",
    sub: "Tap any line to jump back and change it.",
    cta: "Publish",
  },
];

export const EMPTY_DRAFT = {
  images: [],
  title: "",
  business: "",
  category: "",
  categoryId: "",
  // "" and not null, so the empty sub-category is the same falsy empty string
  // every other unanswered field in this draft uses — the pills, the review
  // step and `dirty` in the sheet can all keep asking one question of it.
  subcategory: "",
  price: "",
  description: "",
  /*
    The personals group.

    Asked for on the Personals board, or for Marketplace's Dating category.
    A dining table has no eye colour. Every one of these fields
    is empty-string-optional, in the same sense and for the same reason as the
    sub-category above it: a required second choice turns a thirty-second post
    into a taxonomy quiz, and the posts that lose are the ones nobody could be
    bothered to finish. A profile with two of the eight filled in is worth more
    to the board than a blank one that gave up at "body stats".

    Name and city are deliberately not here, though the ad detail page lists
    them. `business` already holds who is posting and `location` already holds
    where — asking a second time would produce two answers that can disagree,
    and the only way to find out which one the ad actually went out under would
    be to post it.
  */
  age: "",
  ethnicity: "",
  availability: "",
  height: "",
  weight: "",
  bodyStats: "",
  hairColour: "",
  eyeColour: "",
  location: "",
  locationId: "",
  provinceId: "",
  email: "",
  phone: "",
};

/**
 * Move one image to a new position in the list, the rest shifting to make
 * room. Index 0 is the cover — this is the mechanism behind both "make
 * cover" (`toIndex` 0) and nudging a photo one place over — and it is the
 * *only* way a poster changes the cover short of deleting and re-adding
 * every photo ahead of it, which is what `StepPhotos` offered before this.
 *
 * Pure and exported on its own so the reordering logic is provable without a
 * DOM: `adDraft.test.js` covers the array mechanics directly, and
 * `StepPhotos.test.jsx` only has to check that the right button calls it
 * with the right arguments.
 */
export function reorderImages(images, fromIndex, toIndex) {
  if (
    !Array.isArray(images) ||
    fromIndex < 0 ||
    fromIndex >= images.length ||
    toIndex < 0
  ) {
    return images;
  }
  const clamped = Math.min(toIndex, images.length - 1);
  if (clamped === fromIndex) return images;
  const next = images.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clamped, 0, moved);
  return next;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/*
  A number, then an optional unit. Deliberately loose about which unit — half
  the board thinks in kilos and half in pounds, and a form that insists on one
  of them is a form people abandon rather than convert for. What it will not
  accept is a weight with no number in it at all, because "average" and "slim"
  are answers to a different question and they make the field unsortable for
  anyone who later wants to filter on it.
*/
const WEIGHT = /^\d{2,3}(\.\d+)?\s*(kg|kgs|lb|lbs|pounds)?$/i;

/**
 * Whether this draft is a post about a person rather than a thing. The gate on
 * the whole personals group, in one place so the form and the validator cannot
 * disagree about which drafts get asked the extra questions — a field that is
 * validated but never rendered produces an error the poster cannot see, let
 * alone fix.
 */
export const isPersonalsCategory = (category) =>
  IS_PERSONALS || category === "Dating";

export const SELECT_CATEGORY_MESSAGE = "Select a category from the list.";

export const hasSelectedCategory = (draft) =>
  [draft.category, draft.categoryId].every(isNonEmptyString);

export const SELECT_LOCATION_MESSAGE = "Select a location from the suggestions.";

/** Labels are display text; only a catalog selection identifies the location. */
export const hasSelectedLocation = (draft) =>
  [draft.location, draft.locationId, draft.provinceId].every(isNonEmptyString);

/**
 * Per-step validation. Returns a { field: message } map; empty means the step
 * can advance. Kept out of the component so the wizard can't advance on a
 * step it never checked.
 */
export function validateStep(stepId, draft) {
  const errors = {};

  if (stepId === "photos") {
    if (!draft.images.length) errors.images = "Add at least one photo.";
    else if (draft.images.length > MAX_IMAGES)
      errors.images = `Pick at most ${MAX_IMAGES} photos.`;
  }

  if (stepId === "details") {
    if (draft.title.trim().length < 4)
      errors.title = "Give your ad a title of at least 4 characters.";
    if (!draft.business.trim())
      errors.business = "Add the business or seller name.";
    if (!hasSelectedCategory(draft)) errors.category = SELECT_CATEGORY_MESSAGE;
    if (draft.price !== "" && !(Number(draft.price) >= 0))
      errors.price = "Price must be a positive number.";
    if (draft.description.trim().length < 20)
      errors.description = "Describe your ad in at least 20 characters.";

    /*
      The personals group, checked only where it is asked for.

      Nothing in here is ever "you must answer this". These are the three
      answers that can be given and still be wrong: an age under the board's own
      18+ line, a weight with no number in it, and an ethnicity that is not one
      of the eight offered, including a draft restored from an older build.

      Every read is truthiness rather than `!== ""`, so a draft restored from
      before this group existed — no `age` key at all — is the valid-and-absent
      case rather than a crash on `undefined.trim`.
    */
    if (isPersonalsCategory(draft.category)) {
      if (draft.age) {
        const age = Number(draft.age);
        if (!Number.isInteger(age) || age < 18 || age > 99)
          errors.age = "Age must be a whole number between 18 and 99.";
      }
      if (draft.weight && !WEIGHT.test(String(draft.weight).trim()))
        errors.weight = "Weight needs a number, e.g. 54 kg or 120 lbs.";
      if (draft.ethnicity && !ethnicities.includes(draft.ethnicity))
        errors.ethnicity = `"${draft.ethnicity}" isn't one of the options. Pick another, or leave it blank.`;
    }
  }

  if (stepId === "contact") {
    if (!hasSelectedLocation(draft)) errors.location = SELECT_LOCATION_MESSAGE;
    if (!EMAIL.test(draft.email.trim()))
      errors.email = "Enter a valid email address.";
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15)
      errors.phone = "Enter a phone number with 7-15 digits.";
  }

  return errors;
}

export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

/* -------------------------------------------------------- backend mapping */

/** The personals group's keys, as carried on both the draft and `attributes`. */
const PERSONAL_ATTRIBUTE_KEYS = [
  "age",
  "ethnicity",
  "availability",
  "height",
  "weight",
  "bodyStats",
  "hairColour",
  "eyeColour",
];

/**
 * The other direction: a backend `ListingResponse` -> a draft the edit
 * sheet's steps can read, the same job `draftFrom` in `lib/listings.js` did
 * for a mock row. Every key of `EMPTY_DRAFT` is filled for the same reason
 * that function states — the steps read `draft.title.length` and
 * `draft.phone.replace` with no guard.
 *
 * Labels are for display: keep the exact category, location and province ids
 * so editing cannot move an ad to a different catalog entry with the same name.
 */
export function draftFromListing(listing) {
  const attributes = listing.attributes ?? {};
  const draft = {
    ...EMPTY_DRAFT,
    images: (listing.media ?? [])
      .filter((m) => m.url)
      .map((m) => ({ id: m.id, name: m.fileName, url: m.url })),
    title: listing.title ?? "",
    business: listing.businessName ?? "",
    category: listing.categoryLabel ?? "",
    categoryId: listing.categoryId ?? "",
    subcategory: attributes.subcategory ?? "",
    price: listing.price == null ? "" : String(listing.price),
    description: listing.description ?? "",
    location: listing.locationLabel ?? "",
    locationId: listing.locationId ?? "",
    provinceId: listing.provinceId ?? "",
    email: listing.contactEmail ?? "",
    phone: listing.contactPhone ?? "",
  };
  for (const key of PERSONAL_ATTRIBUTE_KEYS) draft[key] = attributes[key] ?? "";
  return draft;
}

/**
 * A validated draft -> the backend's `ListingWriteRequest` shape (see
 * Backend's `ListingWriteRequest.java`). Category and location pickers store
 * exact catalog ids on the draft, so no label matching or network lookups
 * are needed when assembling the request.
 *
 * The sub-category and (when the category is a personals one) the eight
 * personals fields have no dedicated column on the backend — they ride
 * along in `attributes`, the free-form map `ListingWriteRequest` offers for
 * exactly this. Blank answers are left off rather than sent as `""`, so an
 * unanswered question stays unanswered instead of becoming an attribute a
 * moderator or a future filter has to learn to ignore.
 */
export function toListingWriteRequest(draft, { site }) {
  const attributes = {};
  if (draft.subcategory) attributes.subcategory = draft.subcategory;
  if (isPersonalsCategory(draft.category)) {
    for (const key of PERSONAL_ATTRIBUTE_KEYS) {
      if (draft[key]) attributes[key] = String(draft[key]);
    }
  }

  return {
    site,
    title: draft.title.trim(),
    businessName: draft.business.trim(),
    description: draft.description.trim(),
    price: draft.price === "" || draft.price == null ? null : Number(draft.price),
    categoryId: draft.categoryId,
    provinceId: draft.provinceId,
    locationId: draft.locationId,
    contactEmail: draft.email.trim(),
    contactPhone: draft.phone.trim(),
    latitude: null,
    longitude: null,
    attributes,
  };
}

/* ------------------------------------------------------------ persistence */

/**
 * A create-ad draft used to be in-memory only: real, and gone the moment the
 * tab reloaded, taking every photo and every typed field with it. This is
 * that draft, given the same treatment `ListingsContext` gives a published
 * ad — a versioned localStorage key, written on every change, read back once
 * on mount.
 *
 * Versioned like every other key this app writes (see `persisted.js`), so a
 * shape this build no longer understands — a field renamed, `images`
 * restructured — is never read back and trusted; a build that no longer
 * recognises `v1` simply finds nothing there and opens on a blank draft,
 * which is the same outcome a first-ever visit gets.
 */
export const DRAFT_KEY = "vezlist:ad-draft:v1";

/**
 * Whether a draft has anything in it worth keeping — the same question the
 * sheet already needed answered for its own "Discard" button and its
 * "come back and the draft is still here" toast, so this is that logic,
 * named and exported rather than re-derived wherever the answer is needed
 * next. A category selection is intentional and worth restoring, just like
 * a typed title. A fresh draft has no preselected category.
 */
export function isDraftWorthSaving(draft) {
  return (
    draft.images.length > 0 ||
    Object.entries(draft).some(
      ([k, v]) => k !== "images" && v !== "",
    )
  );
}

/** A photo entry worth restoring: an id to key it by, and a URL to show. */
function isDraftImage(value) {
  return (
    isObject(value) && isNonEmptyString(value.id) && isNonEmptyString(value.url)
  );
}

/**
 * Storage handing back what it kept, guarded the way every other store in
 * this app guards a rehydrate — see `normaliseAdsState` in `listings.js` for
 * the pattern. `null` means "nothing worth restoring," which covers a
 * missing key, a hand-edited value, and a draft written by a shape this
 * build no longer produces alike; the caller falls back to a fresh draft in
 * every one of those cases rather than crashing on a `.map` over something
 * that was never an array.
 *
 * Every field is read and re-validated rather than the stored object being
 * trusted wholesale — a stray top-level key (or the whole value being an
 * array, which passes `typeof === "object"` but is not this shape at all)
 * is dropped rather than carried into React state, the same rule
 * `guards.js`'s own doc comment states once for every store built on it.
 */
export function normaliseDraft(value) {
  if (!isObject(value)) return null;

  const images = arrayOf(value.images, isDraftImage)
    .slice(0, MAX_IMAGES)
    .map((image, i) => ({
      id: image.id,
      name: isNonEmptyString(image.name) ? image.name : `Photo ${i + 1}`,
      url: image.url,
    }));

  const draft = { ...EMPTY_DRAFT, images };
  for (const key of Object.keys(EMPTY_DRAFT)) {
    if (key === "images") continue;
    if (isString(value[key])) draft[key] = value[key];
  }
  return draft;
}
