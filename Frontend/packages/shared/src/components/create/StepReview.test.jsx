import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { EMPTY_DRAFT } from "../../lib/adDraft.js";
import StepReview from "./StepReview.jsx";

test("regular review is the user's preview and explains publication without staff approval", () => {
  render(
    <StepReview
      draft={{ ...EMPTY_DRAFT, title: "A draft ad" }}
      onEdit={vi.fn()}
      verified={false}
      onToggleVerified={vi.fn()}
    />,
  );
  expect(screen.getByText("Preview")).toBeTruthy();
  expect(screen.getByText(/A regular ad goes public/).textContent).toContain(
    "without staff approval",
  );
  expect(document.querySelector(".bg-emerald-500")).toBe(null);
  expect(screen.getByRole("button", { name: "Edit Title" })).toBeTruthy();
});

test("choosing verified explains privacy until staff approval and does not grant a badge", () => {
  const toggle = vi.fn();
  const view = render(
    <StepReview
      draft={EMPTY_DRAFT}
      onEdit={vi.fn()}
      verified={false}
      onToggleVerified={toggle}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /Post as Verified/ }));
  expect(toggle).toHaveBeenCalledWith(true);
  view.rerender(
    <StepReview
      draft={EMPTY_DRAFT}
      onEdit={vi.fn()}
      verified
      onToggleVerified={toggle}
    />,
  );
  expect(
    screen.getByText(/Your ad stays private until staff approve/),
  ).toBeTruthy();
  expect(screen.queryByText(/A regular ad goes public/)).toBe(null);
});
