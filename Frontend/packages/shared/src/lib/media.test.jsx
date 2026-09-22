import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  MAX_EDGE,
  QUALITY,
  WATERMARK_TEXT,
  downscaleToDataUri,
  urlToStrippedDataUri,
} from "./media.js";

/**
 * The DOM-backed half of the photo pipeline, at the level of the two
 * functions themselves rather than through the create-ad wizard —
 * `CreateAdSheet.test.jsx` already covers the wizard, and `media.test.js`
 * covers everything in `media.js` that needs no DOM at all.
 *
 * What this file exists for: to make it impossible to ship a photo that
 * skipped the watermark. `downscaleToDataUri` is the single chokepoint every
 * uploaded photo's bytes pass through, so "the mark is on every photo" is a
 * claim about one call site, and the tests below pin that call site down —
 * that the mark is drawn at all, that it is drawn *after* the pixels land
 * and *before* they are encoded, and that a photo already smaller than
 * `MAX_EDGE` gets it too rather than slipping past on a size check that
 * doesn't exist yet and must never be added.
 *
 * The ceiling on all of it, stated so nobody reads more into a green run
 * than is there: jsdom implements neither `createImageBitmap` nor real
 * canvas rasterisation or encoding, so nothing here renders a single pixel
 * and no test in this repo can look at the output and *see* the word. Both
 * are faked below. These are code-path assertions — the strongest thing
 * available in this environment, and the reason `lib/media.js` documents the
 * pixel-level verification as having been done out-of-band instead.
 */

let ctx;
let toDataURL;
let canvasCount;

/**
 * A full 2D context, unlike the four-method stub `CreateAdSheet.test.jsx`
 * gets by with: this file is the one asserting on the drawing itself, so
 * every method the watermark reaches for has to exist and every call has to
 * be logged in order. jsdom's own `getContext` returns `null` without the
 * optional `canvas` package, so this is a replacement and not a spy.
 */
const makeContext = () => {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push({ name, args });
  return {
    calls,
    save: record("save"),
    restore: record("restore"),
    drawImage: record("drawImage"),
    strokeText: record("strokeText"),
    fillText: record("fillText"),
  };
};

beforeEach(() => {
  canvasCount = 0;
  ctx = makeContext();
  // Logged into the same list as the context calls, because the assertion
  // that matters most here is an *ordering* one spanning both objects: the
  // mark has to be painted before the pixels are handed to the encoder.
  toDataURL = vi.fn((type, quality) => {
    ctx.calls.push({ name: "toDataURL", args: [type, quality] });
    return `data:image/jpeg;base64,MOCK-${(canvasCount += 1)}`;
  });

  global.createImageBitmap = vi.fn(async (blob) => ({
    width: blob?.width ?? 2000,
    height: blob?.height ?? 1500,
    close: vi.fn(),
  }));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
  HTMLCanvasElement.prototype.toDataURL = toDataURL;
});

afterEach(() => {
  delete global.createImageBitmap;
});

/**
 * A stand-in for a decoded source of a given size. `createImageBitmap` above
 * reads the dimensions straight back off it, which is how a test says "this
 * photo is already smaller than MAX_EDGE" without needing a real encoder.
 */
const source = (width, height) => ({ width, height });

const called = (name) => ctx.calls.filter((c) => c.name === name);
const order = (name) => ctx.calls.findIndex((c) => c.name === name);

describe("downscaleToDataUri — the watermark chokepoint", () => {
  test("every photo comes out of the pipeline with the wordmark painted into it", async () => {
    const uri = await downscaleToDataUri(source(2000, 1500));

    expect(uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(called("fillText")).toHaveLength(1);
    expect(called("fillText")[0].args[0]).toBe(WATERMARK_TEXT);
  });

  test("the mark is drawn after the pixels and before the encode — in the bytes, not over them", async () => {
    await downscaleToDataUri(source(2000, 1500));

    // The ordering is the entire guarantee. Drawn before `drawImage` the
    // photo would paint straight over it; drawn after `toDataURL` it would
    // miss the encode and exist only on a canvas nobody reads.
    expect(order("drawImage")).toBeGreaterThanOrEqual(0);
    expect(order("drawImage")).toBeLessThan(order("fillText"));
    expect(order("fillText")).toBeLessThan(order("toDataURL"));
    expect(toDataURL).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", QUALITY);
  });

  test("a photo already smaller than MAX_EDGE is marked too — there is no passthrough to slip through", async () => {
    // The exact case a future "it's already small enough, skip the canvas"
    // optimisation would break, and it would break the EXIF guarantee in the
    // same edit. Both are asserted here so neither can go quietly.
    const uri = await downscaleToDataUri(source(320, 240));

    expect(uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(called("drawImage")).toHaveLength(1);
    expect(called("fillText")).toHaveLength(1);
    expect(called("fillText")[0].args[0]).toBe(WATERMARK_TEXT);
  });

  test("the mark scales to the canvas that was actually produced, not the source photo", async () => {
    // A 4000px source is downscaled to MAX_EDGE first, so the mark has to be
    // sized against 1200 — measuring the untouched source would put a mark
    // three times too large on the saved photo.
    await downscaleToDataUri(source(4000, 3000));
    const bigCanvasFont = ctx.font;

    ctx = makeContext();
    await downscaleToDataUri(source(4000 / 10, 3000 / 10));

    expect(ctx.font).not.toBe(bigCanvasFont);
    expect(MAX_EDGE).toBe(1200);
  });
});

describe("urlToStrippedDataUri — no second stamp on an already-marked photo", () => {
  test("a data: URI is handed back untouched, so a marked photo never reaches a second canvas", async () => {
    // This is the whole double-stamp argument, made executable: every photo
    // that has been through `downscaleToDataUri` is a `data:` URI by the
    // time it reaches this function, and a `data:` URI returns on the first
    // line. The marked and the about-to-be-marked are disjoint sets.
    const already = "data:image/jpeg;base64,MARKED-ONCE";

    await expect(urlToStrippedDataUri(already)).resolves.toBe(already);
    expect(global.createImageBitmap).not.toHaveBeenCalled();
    expect(toDataURL).not.toHaveBeenCalled();
    expect(called("fillText")).toHaveLength(0);
  });

  test("an https: URL from a seeded row is left alone as well", async () => {
    const seeded = "https://images.example.com/couch.jpg";

    await expect(urlToStrippedDataUri(seeded)).resolves.toBe(seeded);
    expect(called("fillText")).toHaveLength(0);
  });

  test("a stray blob: URL — the one thing that has not been through the pipeline — is marked", async () => {
    global.fetch = vi.fn(async () => ({ blob: async () => source(900, 600) }));

    const uri = await urlToStrippedDataUri("blob:http://localhost/abc");

    expect(uri).toMatch(/^data:image\/jpeg;base64,/);
    expect(called("fillText")[0].args[0]).toBe(WATERMARK_TEXT);
    delete global.fetch;
  });
});
