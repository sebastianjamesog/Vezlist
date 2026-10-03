import { beforeEach, describe, expect, test } from "vitest";
import { render, screen, userEvent } from "../../../testing/render.jsx";
import AgeGate from "./AgeGate.jsx";

const OLD_STORAGE_KEY = "vezlist:age-gate:v1";
const open = (text = "The board") =>
  render(
    <AgeGate>
      <div>{text}</div>
    </AgeGate>,
  );
const enterButton = () =>
  screen.getByRole("button", { name: "I am 18 or older — Enter" });
const board = () => screen.getByText("The board").closest(".contents");

describe("AgeGate", () => {
  beforeEach(() => {
    localStorage.removeItem(OLD_STORAGE_KEY);
    document.documentElement.removeAttribute("data-age-gate");
  });

  test("a fresh visit shows the warning and makes the board inert", () => {
    open();
    expect(
      screen.getByRole("dialog", { name: "This site is for adults" }),
    ).toBeTruthy();
    expect(board().hasAttribute("inert")).toBe(true);
    expect(document.documentElement.dataset.ageGate).toBe("gate");
  });

  test("an old stored acceptance cannot bypass a new visit", () => {
    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify({ confirmed: true }));
    open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(board().hasAttribute("inert")).toBe(true);
  });

  test("entering opens this visit without storing an acceptance", async () => {
    const user = userEvent.setup();
    open();
    await user.click(enterButton());
    expect(screen.queryByRole("dialog")).toBe(null);
    expect(board().hasAttribute("inert")).toBe(false);
    expect(document.documentElement.dataset.ageGate).toBe("ok");
    expect(localStorage.getItem(OLD_STORAGE_KEY)).toBe(null);
  });

  test("navigation within the mounted layout stays open, then a new mount asks again", async () => {
    const user = userEvent.setup();
    const view = open();
    await user.click(enterButton());
    view.rerender(
      <AgeGate>
        <div>Another page</div>
      </AgeGate>,
    );
    expect(screen.queryByRole("dialog")).toBe(null);
    view.unmount();
    open();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(board().hasAttribute("inert")).toBe(true);
  });

  test("leaving is offered alongside entering", () => {
    open();
    expect(
      screen
        .getByRole("link", { name: "Leave — take me to Vezlist" })
        .getAttribute("href"),
    ).toBeTruthy();
  });
});
