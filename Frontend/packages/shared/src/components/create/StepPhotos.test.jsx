import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "../../../../../testing/render.jsx";
import StepPhotos from "./StepPhotos.jsx";
import { WATERMARK_TEXT } from "../../lib/media.js";

/**
 * `StepPhotos` in isolation, as a controlled component: given `images` and a
 * handful of callbacks, does it call the right one with the right
 * arguments? `CreateAdSheet.test.jsx` covers the same reordering through the
 * whole wizard, photo pipeline included; this file is the fast, no-mocking
 * check that the buttons themselves are wired correctly regardless of what
 * produces the image list.
 */
const img = (id) => ({ id, name: id, url: `data:image/jpeg;base64,${id}` });

const open = (over = {}) => {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const onReorder = vi.fn();
  render(
    <StepPhotos
      images={[]}
      onAdd={onAdd}
      onRemove={onRemove}
      onReorder={onReorder}
      {...over}
    />,
  );
  return { onAdd, onRemove, onReorder };
};

describe("StepPhotos — empty state", () => {
  test("shows the picker, not the grid, with nothing to reorder", () => {
    open();
    expect(
      screen.getByRole("button", { name: /Add your photos/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBe(null);
  });
});

describe("StepPhotos — a single photo", () => {
  test("is the cover and offers no reorder controls — there is nothing to reorder against", () => {
    open({ images: [img("a")] });
    expect(screen.getByText("Cover")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Move|Make/ })).toBe(null);
  });
});

describe("StepPhotos — several photos", () => {
  test("the cover (index 0) has no move/make-cover buttons of its own", () => {
    open({ images: [img("a"), img("b"), img("c")] });
    expect(screen.queryByRole("button", { name: "Move a earlier" })).toBe(null);
    expect(
      screen.queryByRole("button", { name: "Make a the cover photo" }),
    ).toBe(null);
  });

  test("'Make cover' calls onReorder with the photo's id and index 0", async () => {
    const user = userEvent.setup();
    const { onReorder } = open({ images: [img("a"), img("b"), img("c")] });

    await user.click(
      screen.getByRole("button", { name: "Make c the cover photo" }),
    );
    expect(onReorder).toHaveBeenCalledWith("c", 0);
  });

  test("'Move earlier' calls onReorder with index - 1", async () => {
    const user = userEvent.setup();
    const { onReorder } = open({ images: [img("a"), img("b"), img("c")] });

    await user.click(screen.getByRole("button", { name: "Move c earlier" }));
    expect(onReorder).toHaveBeenCalledWith("c", 1);
  });

  test("'Move later' calls onReorder with index + 1, and is disabled on the last photo", async () => {
    const user = userEvent.setup();
    const { onReorder } = open({ images: [img("a"), img("b"), img("c")] });

    await user.click(screen.getByRole("button", { name: "Move b later" }));
    expect(onReorder).toHaveBeenCalledWith("b", 2);

    // Rendered rather than removed — a screen reader user tabbing the row
    // still finds it and hears "disabled" — but inert.
    expect(screen.getByRole("button", { name: "Move c later" }).disabled).toBe(
      true,
    );
  });

  test("Remove still calls onRemove with the photo's id, unaffected by the new controls", async () => {
    const user = userEvent.setup();
    const { onRemove } = open({ images: [img("a"), img("b")] });

    await user.click(screen.getByRole("button", { name: "Remove b" }));
    expect(onRemove).toHaveBeenCalledWith("b");
  });

  test("every reorder control is a real, focusable button — keyboard reachable and activatable", async () => {
    const user = userEvent.setup();
    const { onReorder } = open({ images: [img("a"), img("b")] });

    const makeCover = screen.getByRole("button", {
      name: "Make b the cover photo",
    });
    await user.tab();
    // Tab order: Remove(a) has no images before it worth cycling through in
    // this two-photo case beyond confirming Tab reaches the control at all.
    while (document.activeElement !== makeCover && document.activeElement) {
      await user.tab();
    }
    expect(document.activeElement).toBe(makeCover);
    await user.keyboard("{Enter}");
    expect(onReorder).toHaveBeenCalledWith("b", 0);
  });
});

describe("StepPhotos — the watermark is disclosed, not sprung", () => {
  test("the empty picker says photos will be marked, before any are chosen", () => {
    open();
    // `getAllBy`, not `getBy`: a substring regex matches every ancestor whose
    // textContent contains it, so the wrapper elements match alongside the
    // paragraph and a singular query would fail for the wrong reason.
    expect(
      screen.getAllByText(new RegExp(`small ${WATERMARK_TEXT} mark`)).length,
    ).toBeGreaterThan(0);
  });

  test("the grid keeps saying it, with no toggle offered — the mark is unconditional", () => {
    open({ images: [img("a"), img("b")] });
    // `getAllBy`, not `getBy`: a substring regex matches every ancestor whose
    // textContent contains it, so the wrapper elements match alongside the
    // paragraph and a singular query would fail for the wrong reason.
    expect(
      screen.getAllByText(new RegExp(`small ${WATERMARK_TEXT} mark`)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).toBe(null);
    expect(screen.queryByRole("switch")).toBe(null);
  });
});

describe("StepPhotos — busy", () => {
  test("disables adding more while a photo is being processed", () => {
    open({ images: [img("a")], busy: true });
    expect(document.querySelector('input[type="file"]').disabled).toBe(true);
    expect(screen.getByText(/Processing photo/)).toBeTruthy();
  });
});

describe("StepPhotos — errors", () => {
  test("an error message is announced as an alert", () => {
    open({ error: "Photo is too large." });
    expect(screen.getByRole("alert").textContent).toBe("Photo is too large.");
  });
});
