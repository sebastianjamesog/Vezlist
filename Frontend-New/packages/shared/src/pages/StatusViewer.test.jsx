import { beforeEach, describe, expect, test } from "vitest";
import {
  renderApp,
  screen,
  userEvent,
  waitFor,
} from "../../../../testing/render.jsx";
import { router, setRoute } from "../../../../testing/stubs/next-navigation.js";
import StatusViewer, {
  ReactionBar,
  ReplyNotice,
  ViewerNote,
} from "./StatusViewer";

/**
 * Status/Stories, over `lib/status.js`.
 *
 * The store's own test proves the pure pieces: a story past `STORY_TTL_MS`
 * drops out of `groupStatuses` and `findActiveStory` treats it as gone. This
 * proves the two things only the screen can — that a deep link to an expired
 * story actually bounces rather than rendering the photo behind it, and that
 * the honest surfaces (reactions, the no-reply notice, the poster's viewer
 * note) are the ones actually on screen rather than a composer, a reply box
 * or an invented viewer count.
 */
describe("StatusViewer", () => {
  beforeEach(() => {
    setRoute({ path: "/status/s1", params: { id: "s1" } });
  });

  test("a story past the 24h TTL bounces the same way an unknown id does", async () => {
    setRoute({ path: "/status/s5", params: { id: "s5" } });
    renderApp(<StatusViewer />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });

  test("an id that was never a story bounces too", async () => {
    setRoute({ path: "/status/nope", params: { id: "nope" } });
    renderApp(<StatusViewer />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });

  test("a story inside the TTL still plays", () => {
    renderApp(<StatusViewer />);
    expect(screen.getByText("Selena Ortiz")).toBeTruthy();
  });

  test("reacting shows this device's own choice and says where it doesn't go", async () => {
    const user = userEvent.setup();
    renderApp(<StatusViewer />);

    const heart = screen.getByRole("button", { name: "React with ❤️" });
    expect(heart.getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.getByText(/your reaction stays on this device/i),
    ).toBeTruthy();

    await user.click(heart);
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByText(
        /only you can see this — vezlist has no way to send it to selena ortiz/i,
      ),
    ).toBeTruthy();

    // Tapping the same reaction again clears it.
    await user.click(heart);
    expect(heart.getAttribute("aria-pressed")).toBe("false");
  });

  test("there is no reply box — only the notice that there is nowhere for one to go", () => {
    renderApp(<StatusViewer />);
    expect(screen.queryByRole("textbox", { name: /reply/i })).toBe(null);
    expect(screen.getByText(/can.t reply here/i)).toBeTruthy();
  });
});

/**
 * The three honest-surface pieces, tested directly rather than only through
 * a story that reaches them. `story.own` (the "mine" entry in `data/mock.js`)
 * carries no updates yet — there is no composer to have posted one with
 * (issue #12) — so `ViewerNote` cannot be reached by navigating the real
 * fixture today. It is still wired into `StatusViewer` for the moment a real
 * posted story exists, and its copy is what actually matters here: it must
 * not claim a viewer count or a name this build cannot know.
 */
describe("the honest surfaces on their own", () => {
  test("ViewerNote says plainly that no device can know who viewed a story", () => {
    renderApp(<ViewerNote />);
    const text = screen.getByText(/vezlist can.t show who.s seen this yet/i);
    expect(text.textContent).not.toMatch(/\d/); // no fabricated view count
  });

  test("ReplyNotice names the two real places anyone types at anyone", () => {
    renderApp(<ReplyNotice />);
    expect(screen.getByRole("link", { name: "Live" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Support ticket" })).toBeTruthy();
  });

  test("ReactionBar never renders a fabricated count, only this device's own pick", () => {
    renderApp(
      <ReactionBar name="Test Poster" reaction="🔥" onReact={() => {}} />,
    );
    expect(
      screen
        .getByRole("button", { name: "React with 🔥" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByText(/\d+ (reacted|reactions|views)/i)).toBe(null);
  });
});
