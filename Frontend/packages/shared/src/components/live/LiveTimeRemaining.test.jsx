import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveTimeRemaining, {
  LiveExpiryWarning,
  liveTimeRemaining,
} from "./LiveTimeRemaining.jsx";

const now = Date.parse("2026-10-24T10:00:00Z");
const session = (seconds, status = "LIVE") => ({
  status,
  endsAt: new Date(now + seconds * 1000).toISOString(),
});

describe("live time remaining", () => {
  it.each([
    [301, null, "05:01"],
    [300, "soon", "05:00"],
    [61, "soon", "01:01"],
    [60, "urgent", "01:00"],
    [1, "urgent", "00:01"],
    [0, "expired", "00:00"],
    [-10, "expired", "00:00"],
  ])("uses the actual deadline at %s seconds", (seconds, warning, label) => {
    expect(liveTimeRemaining(session(seconds), now)).toMatchObject({
      warning,
      label,
    });
  });
  it("warns during reconnecting but not setup, terminal or unknown deadlines", () => {
    expect(liveTimeRemaining(session(10, "RECONNECTING"), now).warning).toBe(
      "urgent",
    );
    for (const status of ["PREPARING", "ENDED", "FAILED"])
      expect(liveTimeRemaining(session(10, status), now)).toBeNull();
    expect(
      liveTimeRemaining({ status: "LIVE", endsAt: "invalid" }, now),
    ).toBeNull();
    expect(liveTimeRemaining(session(10), null)).toBeNull();
  });
  it("shows a non-announcing countdown and changes warning only at thresholds", () => {
    const view = render(
      <>
        <LiveTimeRemaining session={session(240)} now={now} />
        <LiveExpiryWarning session={session(240)} now={now} />
      </>,
    );
    expect(screen.getByRole("timer").textContent).toBe("04:00");
    expect(screen.getByRole("timer").getAttribute("aria-live")).toBe("off");
    expect(screen.getByRole("alert").textContent).toContain(
      "5 minutes or less",
    );
    view.rerender(<LiveExpiryWarning session={session(60)} now={now} />);
    expect(screen.getByRole("alert").textContent).toContain("1 minute or less");
    view.rerender(<LiveExpiryWarning session={session(600)} now={now} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
