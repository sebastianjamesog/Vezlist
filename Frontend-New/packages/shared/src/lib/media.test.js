// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PHOTO_BYTES,
  WATERMARK_TEXT,
  describeSize,
  drawWatermark,
  validatePhotoFile,
} from "./media.js";

/**
 * The pure half of the photo pipeline: whether a picked file is even worth
 * trying to decode, and how the watermark lays itself out. `drawWatermark`
 * belongs here despite being drawing code because it takes a *context*, not
 * a canvas — a plain object that records what was asked of it satisfies it
 * completely, and everything worth asserting about the mark's geometry is
 * arithmetic on two numbers.
 *
 * `downscaleToDataUri` and `urlToStrippedDataUri` do need a DOM
 * (`createImageBitmap`, `document.createElement("canvas")`) that
 * `node --test` does not have — see `media.test.jsx` for that half, which
 * locks in that every accepted photo is actually routed through the re-encode
 * path (watermark included) that this file only clears the way for, and
 * `CreateAdSheet.test.jsx` for the same guarantee through the whole wizard.
 */

const file = (over) => ({
  name: "photo.jpg",
  type: "image/jpeg",
  size: 1024,
  ...over,
});

test("a normal photo passes", () => {
  assert.equal(validatePhotoFile(file()), null);
});

test("a file whose type isn't image/* is refused, not silently dropped", () => {
  const msg = validatePhotoFile(
    file({ name: "resume.pdf", type: "application/pdf" }),
  );
  assert.match(msg, /resume\.pdf/);
  assert.match(msg, /isn't a photo/);
});

test("a file with no type at all (some OS pickers give none for HEIC) is refused the same way", () => {
  assert.match(validatePhotoFile(file({ type: "" })), /isn't a photo/);
});

test("a file right at the limit is fine; one byte over is refused with the size named", () => {
  assert.equal(validatePhotoFile(file({ size: MAX_PHOTO_BYTES })), null);
  const msg = validatePhotoFile(file({ size: MAX_PHOTO_BYTES + 1 }));
  assert.match(msg, /photo\.jpg/);
  assert.match(msg, /under 20\.0MB/);
});

test("a pathological 40MB phone photo is refused with a clear, specific message", () => {
  const msg = validatePhotoFile(file({ size: 40 * 1024 * 1024 }));
  assert.match(msg, /40\.0MB/);
  assert.match(msg, /under 20\.0MB/);
});

test("describeSize renders one decimal place of megabytes", () => {
  assert.equal(describeSize(1024 * 1024), "1.0MB");
  assert.equal(describeSize(1.5 * 1024 * 1024), "1.5MB");
  assert.equal(describeSize(20 * 1024 * 1024), "20.0MB");
});

/* ----------------------------------------------------------- the watermark */

/**
 * A 2D context that draws nothing and remembers everything. Property
 * assignments (`font`, `globalAlpha`, …) land on the object as ordinary
 * fields and are read back directly; the four method calls are logged in
 * order, because the *order* of the halo and the fill is load-bearing and a
 * set of "was it called" assertions would not notice them swapping.
 */
const recordingContext = () => {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push({ name, args });
  return {
    calls,
    save: record("save"),
    restore: record("restore"),
    strokeText: record("strokeText"),
    fillText: record("fillText"),
  };
};

const named = (ctx, name) => ctx.calls.filter((c) => c.name === name);
const index = (ctx, name) => ctx.calls.findIndex((c) => c.name === name);
/** The font size in `700 61px …`, as a number. */
const fontSize = (ctx) => Number(ctx.font.match(/\b(\d+)px/)[1]);

test("the mark is the site's own name, uppercased — not a string spelled out twice", () => {
  // Read off `SITE_NAME`, so the personals bundle marks its photos with its
  // own wordmark and neither build can drift from the other.
  assert.match(WATERMARK_TEXT, /^[A-Z][A-Z ]*$/);
  assert.equal(WATERMARK_TEXT, WATERMARK_TEXT.toUpperCase());
});

test("the wordmark is painted, and painted once — a halo under one white fill", () => {
  const ctx = recordingContext();
  assert.equal(drawWatermark(ctx, 1200, 900), true);

  assert.equal(named(ctx, "fillText").length, 1);
  assert.equal(named(ctx, "strokeText").length, 1);
  assert.equal(named(ctx, "fillText")[0].args[0], WATERMARK_TEXT);
  assert.equal(named(ctx, "strokeText")[0].args[0], WATERMARK_TEXT);
  // Halo first: reversed, the dark stroke would be painted over the letters
  // it exists to sit behind and the mark would read as a black outline.
  assert.ok(index(ctx, "strokeText") < index(ctx, "fillText"));
  assert.equal(ctx.fillStyle, "#ffffff");
});

test("canvas state is saved and restored around the mark, not left set for whatever draws next", () => {
  const ctx = recordingContext();
  drawWatermark(ctx, 1200, 900);
  assert.equal(ctx.calls.at(0).name, "save");
  assert.equal(ctx.calls.at(-1).name, "restore");
});

test("the mark is translucent — a provenance note on the photo, not a stripe across it", () => {
  const ctx = recordingContext();
  drawWatermark(ctx, 1200, 900);
  assert.ok(ctx.globalAlpha >= 0.5 && ctx.globalAlpha <= 0.65);
});

test("the mark sits in the bottom-right corner, inset from both edges", () => {
  const ctx = recordingContext();
  drawWatermark(ctx, 1200, 900);
  const [, x, y] = named(ctx, "fillText")[0].args;

  assert.equal(ctx.textAlign, "right");
  // Right-aligned at `x`, so the word ends there and starts to its left.
  assert.ok(x > 900 && x < 1200);
  assert.ok(y > 700 && y < 900);
  // The same inset on both axes, so the corner looks square rather than
  // pinned harder to one edge than the other.
  assert.equal(1200 - x, 900 - y);
});

test("the mark scales with the frame: a thumbnail and a full-size photo both get a proportionate one", () => {
  const big = recordingContext();
  const small = recordingContext();
  drawWatermark(big, 1200, 900);
  drawWatermark(small, 400, 300);

  // Not "some size on each" — actually larger on the larger photo, which is
  // the whole point of sizing off the frame instead of a constant.
  assert.ok(fontSize(big) > fontSize(small));
  // ~4% cap height of the width, so roughly 6% of the width in em terms.
  assert.ok(fontSize(big) / 1200 > 0.04 && fontSize(big) / 1200 < 0.07);
  assert.ok(fontSize(small) / 400 > 0.04 && fontSize(small) / 400 < 0.09);
});

test("the size is clamped at both ends — never illegible on a tiny crop, never the subject on a poster", () => {
  const tiny = recordingContext();
  const huge = recordingContext();
  drawWatermark(tiny, 96, 96);
  drawWatermark(huge, 4000, 3000);

  // A proportional mark on a 96px square would be 4px tall: unreadable, and
  // therefore not provenance at all.
  assert.ok(fontSize(tiny) >= 16);
  // And an unclamped one on a 4000px source would be 168px tall.
  assert.ok(fontSize(huge) <= 64);
});

test("a wide panorama is measured against its height too, so the mark doesn't fill a short frame", () => {
  const wide = recordingContext();
  const square = recordingContext();
  drawWatermark(wide, 1200, 200);
  drawWatermark(square, 1200, 900);

  // 4% of 1200 would be a fifth of a 200px-tall strip. The height cap is
  // what stops that, so the panorama's mark must come out smaller than the
  // square's despite the two being the same width.
  assert.ok(fontSize(wide) < fontSize(square));
  assert.ok(fontSize(wide) < 200 * 0.2);
});

test("the word is given a width limit so it can never run off a narrow frame", () => {
  const ctx = recordingContext();
  drawWatermark(ctx, 96, 96);
  const [, x, , maxWidth] = named(ctx, "fillText")[0].args;

  assert.ok(maxWidth > 0);
  // Room for the mark and its inset on both sides, with nothing spilling.
  assert.ok(maxWidth <= x);
  assert.equal(named(ctx, "strokeText")[0].args[3], maxWidth);
});

test("a context that cannot render text is declined, not thrown at", () => {
  // The only thing that produces one of these is a test stub — every browser
  // shipping `getContext('2d')` ships `fillText` with it — and losing a
  // poster's photo to a missing method would be a worse trade than losing
  // the mark on it.
  assert.equal(drawWatermark({ drawImage() {} }, 1200, 900), false);
  assert.equal(drawWatermark(null, 1200, 900), false);
});
