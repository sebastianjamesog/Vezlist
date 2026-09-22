import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, userEvent } from "../../../testing/render.jsx";
import AgeGate, { AGE_GATE_STORAGE_KEY } from "./AgeGate.jsx";

/**
 * The 18+ door.
 *
 * `lib/age.test.js` (packages/shared) already proves `isConfirmedAdult` in
 * isolation — every stored shape that must fail closed. This is the other
 * half: that the component reads and writes through that function rather than
 * trusting a bare boolean off storage, that one click is the whole answer now
 * that no date of birth is asked for, and that the board behind the door is
 * genuinely inert while it is shut.
 */

const BOARD_TEXT = "The board";

const open = () =>
  render(
    <AgeGate>
      <div>{BOARD_TEXT}</div>
    </AgeGate>,
  );

const enterButton = () =>
  screen.getByRole("button", { name: "I am 18 or older — Enter" });

const board = () => screen.getByText(BOARD_TEXT).closest(".contents");

describe("AgeGate", () => {
  beforeEach(() => {
    localStorage.removeItem(AGE_GATE_STORAGE_KEY);
  });

  test("an unconfirmed visitor sees the gate, and the board behind it is inert", () => {
    open();
    expect(
      screen.getByRole("dialog", { name: "This site is for adults" }),
    ).toBeTruthy();
    expect(board().hasAttribute("inert")).toBe(true);
  });

  test("the button states what the click confirms, rather than leaving it to inference", () => {
    open();
    expect(enterButton()).toBeTruthy();
    // No date of birth is asked for any more.
    expect(screen.queryByLabelText("Date of birth")).toBe(null);
  });

  test("a stored confirmation shows no gate, and the board is not inert", () => {
    localStorage.setItem(
      AGE_GATE_STORAGE_KEY,
      JSON.stringify({ confirmed: true }),
    );
    open();

    expect(screen.queryByRole("dialog")).toBe(null);
    expect(board().hasAttribute("inert")).toBe(false);
  });

  test("a confirmation stored by the date-of-birth version of the gate is still honoured", () => {
    localStorage.setItem(
      AGE_GATE_STORAGE_KEY,
      JSON.stringify({ confirmed: true, dob: "1990-05-20" }),
    );
    open();

    expect(screen.queryByRole("dialog")).toBe(null);
    expect(board().hasAttribute("inert")).toBe(false);
  });

  test.each([
    ["not valid JSON at all", "{not json"],
    ["a JSON value that is not an object", JSON.stringify(["confirmed"])],
    ["an object with no flag at all", JSON.stringify({})],
    ["confirmed: false", JSON.stringify({ confirmed: false })],
    ["a truthy flag that is not true", JSON.stringify({ confirmed: "yes" })],
  ])(
    "a malformed stored value (%s) falls back to showing the gate, not to bypassing it",
    (_label, raw) => {
      localStorage.setItem(AGE_GATE_STORAGE_KEY, raw);
      open();

      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(board().hasAttribute("inert")).toBe(true);
    },
  );

  test("confirming opens the board and persists the answer", async () => {
    const user = userEvent.setup();
    open();

    await user.click(enterButton());

    expect(screen.queryByRole("dialog")).toBe(null);
    expect(board().hasAttribute("inert")).toBe(false);

    const stored = JSON.parse(localStorage.getItem(AGE_GATE_STORAGE_KEY));
    // A boolean and nothing else — no date, no identity. See AgeGate.jsx.
    expect(stored).toEqual({ confirmed: true });
  });

  test("leaving is offered alongside entering, and goes to the other site", () => {
    open();
    const leave = screen.getByRole("link", {
      name: "Leave — take me to Vezlist",
    });
    expect(leave.getAttribute("href")).toBeTruthy();
  });
});
