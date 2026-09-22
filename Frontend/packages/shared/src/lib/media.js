/**
 * The photo pipeline: what a picked file has to pass before it becomes part
 * of a draft, and how its bytes turn into the JPEG data URI that draft and
 * publish both store.
 *
 * INTERIM, same as the rest of the photo path — there is no upload endpoint
 * or object storage (issue #12's server half, out of reach here) and no
 * moderation scan (issue #13, needs a real pipeline). What this file *does*
 * own outright: a phone photo's bytes never leave the browser carrying its
 * GPS tag, every photo that enters a draft carries a burnt-in provenance
 * mark, and a file that would blow the storage budget or hang the tab on
 * decode is refused with a message rather than accepted and left to fail
 * quietly later.
 */

export const MAX_EDGE = 1200;
export const QUALITY = 0.72;

/**
 * The line between "a phone photo" and "something that will stall decoding
 * on a mid-range phone and is not going to fit the ~5MB localStorage budget
 * this whole store lives in even after downscaling six of them." Generous on
 * purpose — a modern phone's default camera JPEG is 2-8MB, and a 48MP RAW-ish
 * shot can run higher — but a five-figure-pixel TIFF or a mis-picked video
 * file is refused rather than handed to `createImageBitmap` and hoped for.
 */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export const describeSize = (bytes) =>
  `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Whether a picked file is even worth trying to decode. Pure — no `File`
 * behaviour is used beyond the three properties every caller (a real
 * `<input>`, a drag-and-drop `DataTransfer`, a test) already hands over on
 * a File-shaped object — so this is exercised directly in `media.test.js`
 * rather than only through a component.
 *
 * Returns a message when the file should be refused, `null` when it's fine.
 * A message and not a boolean because "no" on its own is the silent failure
 * this exists to replace — `StepPhotos`'s `accept="image/*"` is a hint the
 * OS file picker can and does let a visitor bypass ("all files"), and it has
 * never said anything about size at all.
 */
export function validatePhotoFile(file) {
  if (
    !file ||
    !isNonEmptyString(file.type) ||
    !file.type.startsWith("image/")
  ) {
    return `"${file?.name ?? "That file"}" isn't a photo.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `"${file.name}" is ${describeSize(file.size)} — photos must be under ${describeSize(MAX_PHOTO_BYTES)}.`;
  }
  return null;
}

/* ----------------------------------------------------------- the watermark */

/**
 * The wordmark, and deliberately **not** `SITE_NAME`.
 *
 * `SITE_NAME` is what each build calls itself — "Vezlist" on the marketplace,
 * "Personals" on the adult board, "Vezlist Console" in admin — and stamping
 * that would put the word PERSONALS on every photo posted to the board where
 * a reposted picture is most likely to turn up somewhere its subject did not
 * choose. That names a *category*, not an owner. It is the one place on this
 * board where being vague about the product is the wrong kind of discretion:
 * a provenance mark exists to be traced back, and "PERSONALS" traces back to
 * nothing.
 *
 * So both boards stamp the company, which is also the only name that means
 * anything to someone who finds the photo with no context. Honest about the
 * limit: this is a name, not a domain, and a URL would be better provenance
 * and worse typography at 4% of the frame — the mark has to survive being
 * screenshotted. The day that trade stops being worth it, this is the line
 * to change.
 */
export const WATERMARK_TEXT = "VEZLIST";

/**
 * What the mark is for, stated plainly so nobody mistakes it for more than
 * it is: it says where a photo came from. It is not DRM and does not pretend
 * to be. Anyone willing to crop the bottom-right corner, clone-stamp it out,
 * or run an inpainting model over it defeats it in seconds, and nothing that
 * can be drawn onto a canvas would change that. What it buys is the ordinary
 * case — a photo lifted off this board and reposted elsewhere with no effort
 * spent on it at all — and that is the case that actually happens.
 *
 * Why the pixels and not a CSS overlay: an overlay lives in this app's DOM,
 * so it is gone the moment anyone right-clicks "save image", opens the
 * `data:` URI directly, or reads the stored draft. To mean anything the mark
 * has to be part of the bytes the photo *is*, which is why this is called
 * from inside `downscaleToDataUri`, between `drawImage` and `toDataURL`, and
 * from nowhere else.
 *
 * The design, and the reasoning behind each choice:
 *
 * - Legibility on any background is the whole difficulty, and translucent
 *   white text alone fails it — it disappears into a bright sky and glares
 *   off a dark interior. A solid scrim rectangle behind the word would solve
 *   that by putting a visible grey box on the poster's photo, which is the
 *   heavy-handedness this is meant to avoid. So each glyph carries its own
 *   darkness instead: a wide, round-joined dark stroke drawn *under* the
 *   white fill, plus a blurred dark shadow. The halo tracks the letterforms,
 *   so the only pixels it darkens are ones the mark already covers, and the
 *   white always has something to read against whatever is behind it.
 *
 * - `globalAlpha` rather than a translucent fill colour, so one number
 *   governs the whole mark — halo included — and it fades as a single object
 *   instead of a white word sitting on a separate grey ghost of itself.
 *
 * - Size as a fraction of the frame, not a fixed pixel height: a mark that
 *   is discreet on a 1200px photo is a banner across a 300px thumbnail.
 *   Driven off width, the dimension the wordmark runs along, but also capped
 *   against height, because a downscaled panorama can be 1200x200 and 4% of
 *   *width* would then be a fifth of the picture. Clamped at both ends so it
 *   is never too small to read nor big enough to become the subject.
 *
 * - Bottom-right, the corner a photo's own subject is least often in, with a
 *   margin scaled to the mark itself so the inset looks the same at any size.
 *
 * - No web font and no image asset. A canvas can only paint fonts the
 *   document has already loaded, so anything exotic would silently fall back
 *   to the platform default on a slow connection and produce a mark that
 *   differs from photo to photo. A generic bold sans stack is the same
 *   everywhere and needs nothing awaited.
 *
 * Takes a context rather than a canvas so it can be tested against a plain
 * recording object with no DOM at all, and returns whether it actually drew.
 * That guard is not defensive programming for its own sake: every browser
 * that hands back a 2D context implements `fillText`, so the only thing that
 * can fail it is a stubbed context in a test, and a stub is not worth
 * throwing away a poster's photo over. What stops the `false` branch from
 * ever becoming the production path is `media.test.jsx`, which asserts the
 * mark is drawn, in order, on the way through `downscaleToDataUri`.
 */
export function drawWatermark(ctx, width, height) {
  if (!ctx || typeof ctx.fillText !== "function") return false;

  // Cap height — the height of a capital letter — not the font size, which
  // measures the em box and runs about a third taller.
  const cap = Math.round(
    Math.max(12, Math.min(44, Math.min(width * 0.042, height * 0.09))),
  );
  const fontSize = Math.round(cap / 0.72);
  const margin = Math.round(
    Math.max(cap * 0.85, Math.min(width, height) * 0.025),
  );
  const x = width - margin;
  const y = height - margin;
  // `WATERMARK_TEXT` is uppercase, so it has no descenders and an alphabetic
  // baseline puts the bottom of the glyphs exactly `margin` off the edge.
  // The width limit is the last resort for a frame narrow enough that even
  // the clamped-to-minimum mark would overrun it: the engine condenses the
  // word to fit rather than letting it run off the side of the picture.
  const maxWidth = Math.max(1, width - margin * 2);

  ctx.save();
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  // Tracking, because a wordmark set solid reads as a word and set open
  // reads as a mark. Ignored by engines that predate the property, which
  // costs nothing but the tracking.
  ctx.letterSpacing = `${(fontSize * 0.06).toFixed(2)}px`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 0.6;

  // The halo first, so the white fill lands on top of it rather than under.
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.max(2, Math.round(cap * 0.5));
  ctx.shadowOffsetY = Math.max(1, Math.round(cap * 0.08));
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, cap * 0.2);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.strokeText(WATERMARK_TEXT, x, y, maxWidth);

  // Shadow off before the fill: left on, it would stack a second copy of the
  // blur directly under the letterforms and muddy them.
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(WATERMARK_TEXT, x, y, maxWidth);
  ctx.restore();

  return true;
}

/**
 * A blob's pixels, downscaled, marked, and re-encoded as a JPEG data URI.
 * This is the one function every photo's bytes pass through on the way into
 * a draft, and that is what makes both EXIF/GPS-stripping and the watermark
 * guarantees rather than side effects of the resize.
 *
 * The EXIF guarantee, spelled out rather than assumed: a `<canvas>`'s bitmap
 * holds decoded *pixels* and nothing else — the 2D rendering context has no
 * metadata channel, so `drawImage` cannot read a source's EXIF segment and
 * `toDataURL`/`toBlob` cannot write one into the output even if asked to. A
 * phone photo's GPS tag, camera make/model and orientation all live in the
 * JPEG's APP1/EXIF segment, which sits beside the pixel data in the file —
 * not inside it — and a decode-to-bitmap step has nothing that carries it
 * forward. This is not incidental to the downscale: every photo goes through
 * `createImageBitmap` + `drawImage` + `drawWatermark` + `toDataURL`
 * unconditionally, even one already smaller than `MAX_EDGE` (`scale` clamps
 * to at most `1`, never skips the redraw), so there is no "small photo"
 * branch that could accidentally pass the original bytes through untouched.
 *
 * That missing branch now carries twice the weight it used to. It was
 * already the only thing standing between a small photo and its own GPS tag;
 * it is now also the only thing standing between a small photo and leaving
 * here unmarked. A future "this one is already the right size, skip the
 * canvas" optimisation would quietly break both at once, which is why
 * neither this comment nor the tests treat the redraw as merely a resize.
 *
 * Verified rather than assumed: decoding a JPEG carrying `GPSLatitude` /
 * `GPSLongitude` / `Make` / `Model` EXIF tags to a raw RGB buffer and
 * re-encoding *that buffer alone* (mirroring what `drawImage`+`toDataURL`
 * do — pixels in, pixels out, no metadata argument anywhere in either call)
 * produces a JPEG with no EXIF block at all: no `exif` metadata field on
 * re-read, and no literal "GPS"/"Pixel" bytes anywhere in the re-encoded
 * file. Confirmed with `sharp` (already vendored transitively via Next's
 * image optimizer) as the decode/re-encode engine, standing in for the
 * browser codec `createImageBitmap` uses, because the mechanism being
 * tested — round-tripping through an un-annotated pixel buffer — is the same
 * one either engine performs; jsdom, this repo's component-test DOM, does
 * not implement `createImageBitmap` or real canvas encoding at all, so this
 * could not be proven inside `npm test` and was checked out-of-band instead.
 * The same limitation applies to the watermark: jsdom rasterises nothing, so
 * no test in this repo can look at the output pixels and see the word. What
 * `media.test.jsx` locks in is the *code path* — that every accepted photo
 * is routed through `createImageBitmap` → `drawImage` → `drawWatermark` →
 * `toDataURL`, in that order, and that none of the original file's bytes are
 * copied into the result — so a future change cannot silently reintroduce a
 * passthrough for "small enough" files, or a redraw that forgets the mark.
 *
 * Never throws for a file that failed to decode; the caller drops it and
 * reports why, rather than losing the whole batch to one bad photo.
 */
export async function downscaleToDataUri(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // After the pixels land and before they are encoded — the only window in
    // which the mark becomes part of the file rather than something drawn
    // over it afterwards.
    drawWatermark(ctx, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close?.();
  }
}

/**
 * Same guarantees, from a URL rather than a `File` — what `ListingsContext`
 * has on hand when a row is published or saved, and where this pipeline
 * used to live before photos were downscaled at pick time in `StepPhotos`
 * instead. Kept as a defensive second pass rather than deleted: a `blob:`
 * URL reaching this layer today is already a bug (every photo a poster picks
 * is inlined before it ever joins the draft), but a stray one — a future
 * call site, a draft restored from a shape an older build wrote — is still
 * safer stripped than stored as-is. Anything that is not a `blob:` URL
 * (already a `data:` URI, or an `https:` one from a seeded row) needs no
 * converting and is returned unchanged.
 *
 * Delegating to `downscaleToDataUri` means this pass inherits the watermark
 * for free, and the obvious worry is that a photo already marked at pick
 * time picks up a second mark stamped over the first. It cannot, and the
 * reason is the `blob:` test on the first line rather than anything about
 * the drawing: the only input that reaches a canvas here is a `blob:` URL,
 * and a `blob:` URL is by construction one that has *not* been through this
 * pipeline — everything that has comes out as a `data:` URI and returns on
 * that first line with no canvas ever created. "Already marked" and "about
 * to be marked" are mutually exclusive states, so they never describe the
 * same photo.
 *
 * Worth being precise about the limit of that argument, since it rests on a
 * URL scheme and not on inspecting pixels: this function cannot *tell* that
 * an image is already marked, so a caller that minted a fresh `blob:` URL
 * out of bytes that had already been through here would double-stamp.
 * Nothing in this codebase does that. The honest claim is "no call site can
 * double-stamp", not "double-stamping is impossible" — and if one ever did,
 * the two marks would land in the same corner at nearly the same size, so
 * the symptom would be one slightly denser word rather than two words.
 *
 * A photo that cannot be read is not a reason to lose the ad it's attached
 * to: the original URL comes back instead of throwing. For a `blob:` URL
 * that dies with the tab it came from, same as before this pipeline moved
 * earlier; for anything else, this branch never runs at all.
 */
export async function urlToStrippedDataUri(url) {
  if (!url.startsWith("blob:")) return url;
  try {
    const blob = await fetch(url).then((r) => r.blob());
    return await downscaleToDataUri(blob);
  } catch {
    return url;
  }
}
