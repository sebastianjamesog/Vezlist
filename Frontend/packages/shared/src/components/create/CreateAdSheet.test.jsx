import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  renderApp,
  screen,
  signIn,
  userEvent,
  waitFor,
} from "../../../../../testing/render.jsx";
import CreateAdSheet from "./CreateAdSheet.jsx";
import { DRAFT_KEY, EMPTY_DRAFT, MAX_IMAGES } from "../../lib/adDraft.js";
import { MAX_PHOTO_BYTES, QUALITY } from "../../lib/media.js";

vi.mock("../../lib/api/catalog.js", async () => ({
  ...(await vi.importActual("../../lib/api/catalog.js")),
  getCategories: vi.fn().mockResolvedValue([
    { id: "property", label: "Property" },
    { id: "db-added-services", label: "New services" },
  ]),
  searchLocations: vi.fn().mockResolvedValue([]),
}));

/**
 * The create-ad photo pipeline and the two things #12's frontend half
 * actually delivers on top of it: reordering and draft persistence.
 *
 * `lib/media.test.js` covers `validatePhotoFile` in isolation (no DOM
 * needed); this file covers the DOM-backed half — that `addImages` in
 * `CreateAdSheet` actually routes every accepted photo through
 * `createImageBitmap` → `drawImage` → `toDataURL` rather than ever passing
 * the original bytes through untouched, which is the code-level half of the
 * EXIF/GPS-stripping guarantee documented in `lib/media.js` (the other half —
 * that a canvas round-trip drops metadata at all — was verified out-of-band;
 * jsdom implements neither `createImageBitmap` nor real canvas encoding, so
 * it cannot be proven inside this suite and is mocked here instead).
 *
 * jsdom has no `createImageBitmap` and no working `<canvas>` 2D context, so
 * both are stubbed for every test in this file — real decode/encode
 * behaviour is out of reach here by construction, not by choice.
 */

let bitmaps;
let drawImage;
let toDataURL;
let canvasCounter;

beforeEach(() => {
  canvasCounter = 0;
  bitmaps = [];
  drawImage = vi.fn();
  toDataURL = vi.fn((type, quality) => {
    canvasCounter += 1;
    return `data:image/jpeg;base64,MOCK-${canvasCounter}-${type}-${quality}`;
  });

  global.createImageBitmap = vi.fn(async (blob) => {
    const bitmap = { width: 2000, height: 1500, close: vi.fn(), source: blob };
    bitmaps.push(bitmap);
    return bitmap;
  });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage }));
  HTMLCanvasElement.prototype.toDataURL = toDataURL;
});

describe("CreateAdSheet — publication", () => {
  async function review(props = {}) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...EMPTY_DRAFT,
        images: [
          { id: "photo", name: "photo.jpg", url: "data:image/jpeg;base64,AAA" },
        ],
        title: "Useful household items",
        business: "Local seller",
        description: "Several household items in excellent condition.",
        category: "Property",
        categoryId: "property",
        location: "Nelson",
        locationId: "nelson",
        provinceId: "bc",
        email: "seller@example.com",
        phone: "2505551234",
      }),
    );
    open(props);
    await screen.findByAltText("photo.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("button", { name: "Property" });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Check it over")).toBeTruthy();
  }

  test("waits for submission, blocks duplicate clicks, then clears the saved draft", async () => {
    let resolve;
    const onPublish = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onClose = vi.fn();
    await review({ onPublish, onClose });
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "property", locationId: "nelson" }),
      { requestVerification: false },
    );
    expect(screen.getByRole("button", { name: "Submitting..." }).disabled).toBe(
      true,
    );
    expect(localStorage.getItem(DRAFT_KEY)).not.toBe(null);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Submitting..." }),
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ status: "ACTIVE" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(null);
  });

  test("failed verified submission keeps the draft and choice for retry", async () => {
    const onPublish = vi
      .fn()
      .mockRejectedValueOnce(new Error("Photos are still processing"))
      .mockResolvedValueOnce({ status: "PENDING_REVIEW" });
    const onClose = vi.fn();
    await review({ onPublish, onClose });
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Post as Verified/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Submit for verification" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Photos are still processing",
    );
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).title).toBe(
      "Useful household items",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("checkbox", { name: /Post as Verified/ }).checked,
    ).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Submit for verification" }),
    );
    expect(onPublish).toHaveBeenLastCalledWith(expect.any(Object), {
      requestVerification: true,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(DRAFT_KEY)).toBe(null);
  });
});

afterEach(() => {
  delete global.createImageBitmap;
});

const png = (name, size = 2048) =>
  new File([new Uint8Array(size)], name, { type: "image/png" });

const oversized = (name) => {
  const file = new File([new Uint8Array(1)], name, { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: MAX_PHOTO_BYTES + 1 });
  return file;
};

const open = (props = {}) => {
  signIn({ role: "creator" });
  return renderApp(
    <CreateAdSheet
      open
      onClose={props.onClose ?? (() => {})}
      onPublish={props.onPublish ?? (() => {})}
      {...props}
    />,
  );
};

const fileInput = () => document.querySelector('input[type="file"]');

describe("CreateAdSheet — photo pipeline", () => {
  test("an accepted photo is routed through createImageBitmap + drawImage + toDataURL, never passed through raw", async () => {
    const user = userEvent.setup();
    open();
    const file = png("beach.jpg");

    await user.upload(fileInput(), file);

    const img = await screen.findByAltText("beach.jpg");
    expect(img.getAttribute("src")).toMatch(/^data:image\/jpeg;base64,MOCK-/);

    // The exact file object reached the decoder — not a re-read of a `blob:`
    // object URL, and not the raw bytes copied anywhere in between.
    expect(global.createImageBitmap).toHaveBeenCalledWith(file);
    expect(drawImage).toHaveBeenCalledTimes(1);
    // The re-encode is JPEG at the documented quality, whatever the source
    // format was (this one was PNG) — another way the output can never be a
    // copy of the input bytes.
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", QUALITY);
  });

  test("a file over the size limit is refused with a clear message, not silently dropped", async () => {
    const user = userEvent.setup();
    open();

    await user.upload(fileInput(), oversized("huge.jpg"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/huge\.jpg/);
    expect(alert.textContent).toMatch(/20\.0MB/);
    expect(screen.queryByAltText("huge.jpg")).toBe(null);
    expect(global.createImageBitmap).not.toHaveBeenCalled();
  });

  test("a non-image file is refused rather than handed to the decoder", async () => {
    // `applyAccept: false` because this is exactly the scenario
    // `validatePhotoFile` exists for: `accept="image/*"` is a hint the OS
    // file dialog can apply — "All Files" bypasses it — not an enforced
    // filter, so user-event's own default filtering (which *does* enforce
    // it) would make this test pass for the wrong reason.
    const user = userEvent.setup({ applyAccept: false });
    open();
    const file = new File(["not a photo"], "resume.pdf", {
      type: "application/pdf",
    });

    await user.upload(fileInput(), file);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/resume\.pdf/);
    expect(global.createImageBitmap).not.toHaveBeenCalled();
  });

  test("more than MAX_IMAGES photos in one pick are truncated with a clear message", async () => {
    const user = userEvent.setup();
    open();
    const files = Array.from({ length: MAX_IMAGES + 2 }, (_, i) =>
      png(`p${i}.jpg`),
    );

    await user.upload(fileInput(), files);

    await screen.findByAltText(`p${MAX_IMAGES - 1}.jpg`);
    expect(screen.getAllByRole("img")).toHaveLength(MAX_IMAGES);
    expect((await screen.findByRole("alert")).textContent).toMatch(
      new RegExp(`Only ${MAX_IMAGES} photos per ad`),
    );
  });

  test("a photo that fails to decode is skipped with a message; the rest of the batch still lands", async () => {
    global.createImageBitmap = vi.fn(async (blob) => {
      if (blob.name === "corrupt.jpg") throw new Error("bad codec data");
      return { width: 800, height: 600, close: vi.fn() };
    });
    const user = userEvent.setup();
    open();

    await user.upload(fileInput(), [png("good.jpg"), png("corrupt.jpg")]);

    await screen.findByAltText("good.jpg");
    expect(screen.queryByAltText("corrupt.jpg")).toBe(null);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});

describe("CreateAdSheet — reorder", () => {
  test("'Make cover' moves a photo to the front; the rest keep their relative order", async () => {
    const user = userEvent.setup();
    open();

    await user.upload(fileInput(), [png("a.jpg"), png("b.jpg"), png("c.jpg")]);
    await screen.findByAltText("c.jpg");

    const namesInOrder = () =>
      screen.getAllByRole("img").map((img) => img.getAttribute("alt"));
    expect(namesInOrder()).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(screen.getByText("Cover").closest("div")).toBe(
      screen.getByAltText("a.jpg").closest("div"),
    );

    await user.click(
      screen.getByRole("button", { name: "Make c.jpg the cover photo" }),
    );

    expect(namesInOrder()).toEqual(["c.jpg", "a.jpg", "b.jpg"]);
    expect(screen.getByText("Cover").closest("div")).toBe(
      screen.getByAltText("c.jpg").closest("div"),
    );
  });

  test("the move-earlier / move-later buttons nudge a photo one place, and are keyboard-operable", async () => {
    const user = userEvent.setup();
    open();

    await user.upload(fileInput(), [png("a.jpg"), png("b.jpg"), png("c.jpg")]);
    await screen.findByAltText("c.jpg");

    const namesInOrder = () =>
      screen.getAllByRole("img").map((img) => img.getAttribute("alt"));

    // Keyboard, not a click: focus the button and activate it with Enter,
    // proving the control needs no pointer.
    const moveCEarlier = screen.getByRole("button", {
      name: "Move c.jpg earlier",
    });
    moveCEarlier.focus();
    expect(document.activeElement).toBe(moveCEarlier);
    await user.keyboard("{Enter}");
    expect(namesInOrder()).toEqual(["a.jpg", "c.jpg", "b.jpg"]);

    // c.jpg is at position 1 now (not the cover), so it still has both
    // arrows; the cover position itself (a.jpg, index 0) has neither —
    // covered by its own test below.
    await user.click(screen.getByRole("button", { name: "Move c.jpg later" }));
    expect(namesInOrder()).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  test("the cover photo (position 1) offers no move controls of its own — 'Make cover' on another photo is the only way to displace it", async () => {
    open();
    const user = userEvent.setup();
    await user.upload(fileInput(), [png("a.jpg"), png("b.jpg")]);
    await screen.findByAltText("b.jpg");

    expect(screen.queryByRole("button", { name: "Move a.jpg earlier" })).toBe(
      null,
    );
    expect(
      screen.queryByRole("button", { name: "Make a.jpg the cover photo" }),
    ).toBe(null);
  });

  test("a single photo offers no reorder controls at all — nothing to reorder against", async () => {
    open();
    const user = userEvent.setup();
    await user.upload(fileInput(), [png("only.jpg")]);
    await screen.findByAltText("only.jpg");

    expect(screen.queryByRole("button", { name: /Move|Make/ })).toBe(null);
  });
});

describe("CreateAdSheet — draft persistence", () => {
  test("a photo picked mid-flow survives a simulated reload", async () => {
    const user = userEvent.setup();
    const first = open();
    await user.upload(fileInput(), png("beach.jpg"));
    await screen.findByAltText("beach.jpg");

    // Give the write-back effect a tick to land in storage before "reloading".
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).not.toBe(null));
    first.unmount();

    // A fresh instance, the same way a full page reload would remount the
    // whole tree — nothing here is the same component instance as above.
    open();
    expect(await screen.findByAltText("beach.jpg")).toBeTruthy();
  });

  test("typed fields survive the same reload, not only photos", async () => {
    const user = userEvent.setup();
    const first = open();
    await user.upload(fileInput(), png("beach.jpg"));
    await screen.findByAltText("beach.jpg");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(
      screen.getByPlaceholderText(/2 Bedroom Apartment/),
      "Kayak",
    );

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(DRAFT_KEY));
      expect(stored.title).toBe("Kayak");
    });
    first.unmount();

    // A fresh instance always opens on the photos step regardless of where
    // the previous one left off — only the *fields* are restored, not the
    // step position — so getting back to Details to see the title is the
    // same one tap a poster who reopens the sheet would make.
    open();
    await screen.findByAltText("beach.jpg");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByDisplayValue("Kayak")).toBeTruthy();
  });

  test("discard clears the persisted draft, not just the on-screen one", async () => {
    const user = userEvent.setup();
    const first = open();
    await user.upload(fileInput(), png("beach.jpg"));
    await screen.findByAltText("beach.jpg");

    await user.click(
      screen.getByRole("button", { name: "Discard this draft" }),
    );
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBe(null));
    first.unmount();

    open();
    // Back to the empty state — nothing left to restore.
    expect(
      await screen.findByRole("button", { name: /Add your photos/ }),
    ).toBeTruthy();
    expect(screen.queryByAltText("beach.jpg")).toBe(null);
  });

  test("a fresh draft with no category chosen leaves nothing to restore", async () => {
    const first = open();
    // Sheet mounted, nothing picked or typed.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBe(null));
    first.unmount();

    open();
    expect(
      await screen.findByRole("button", { name: /Add your photos/ }),
    ).toBeTruthy();
  });
});

describe("CreateAdSheet — catalog category selection", () => {
  test("a fresh draft does not silently choose the first category", async () => {
    open();
    await userEvent.upload(fileInput(), png("photo.jpg"));
    await screen.findByAltText("photo.jpg");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
      expect(saved.category).toBe("");
      expect(saved.categoryId).toBe("");
    });
  });

  test("a restored label-only category must be selected before leaving Details", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...EMPTY_DRAFT,
        images: [
          { id: "photo", name: "photo.jpg", url: "data:image/jpeg;base64,AAA" },
        ],
        title: "Useful household items",
        business: "Local seller",
        description: "Several household items in excellent condition.",
        category: "A legacy category",
      }),
    );
    const onPublish = vi.fn();
    open({ onPublish });
    await screen.findByAltText("photo.jpg");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Select a category from the list.")).toBeTruthy();
    expect(onPublish).not.toHaveBeenCalled();
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    expect(saved.category).toBe("A legacy category");
    expect(saved.categoryId).toBe("");
  });
});
