import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import VerificationRequestModal from "./VerificationRequestModal.jsx";
import { currentVerification } from "../../lib/api/verification.js";

vi.mock("../../lib/api/verification.js", () => ({
  currentVerification: vi.fn(),
  uploadVerificationPhoto: vi.fn(),
}));
const request = (overrides = {}) => ({
  id: "request",
  status: "AWAITING_PHOTO",
  photoStatus: "NONE",
  code: "123456",
  ...overrides,
});
const open = (initial) =>
  render(
    <VerificationRequestModal
      open
      publicationPending
      listingId="listing"
      initial={initial}
      onClose={vi.fn()}
    />,
  );
beforeEach(() => {
  vi.clearAllMocks();
});

test("the photo prompt and pending review keep the ad private", () => {
  const view = open(request());
  expect(screen.getByText(/Your ad stays private until approval/)).toBeTruthy();
  view.rerender(
    <VerificationRequestModal
      open
      publicationPending
      listingId="listing"
      initial={request({ status: "PENDING_REVIEW", photoStatus: "READY" })}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText(/Your photo was accepted/).textContent).toContain(
    "Your ad stays private",
  );
});

test("rejection never claims publication; approval shows the live Verified outcome", () => {
  const view = open(
    request({ status: "REJECTED", rejectionReason: "Code not visible" }),
  );
  expect(screen.getByText(/Staff didn't approve/).textContent).toContain(
    "Your ad stays private",
  );
  expect(screen.getByText("Code not visible")).toBeTruthy();
  view.rerender(
    <VerificationRequestModal
      open
      publicationPending
      listingId="listing"
      initial={request({ status: "APPROVED" })}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByText("Your ad is live with the Verified badge."),
  ).toBeTruthy();
});

test("resuming a photo still processing restarts status polling", async () => {
  vi.useFakeTimers();
  currentVerification.mockResolvedValue(
    request({ status: "PENDING_REVIEW", photoStatus: "READY" }),
  );
  open(request({ photoStatus: "PROCESSING" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(currentVerification).toHaveBeenCalledWith("listing");
  expect(screen.getByText("Pending staff review")).toBeTruthy();
});

test("closing while processing prevents another polling request", async () => {
  vi.useFakeTimers();
  const view = open(request({ photoStatus: "PROCESSING" }));
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(currentVerification).not.toHaveBeenCalled();
});

test("Check again resumes polling after the automatic attempts are exhausted", async () => {
  vi.useFakeTimers();
  currentVerification.mockResolvedValue(request({ photoStatus: "PROCESSING" }));
  open(request({ photoStatus: "PROCESSING" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(9000);
  });
  expect(currentVerification).toHaveBeenCalledTimes(6);
  currentVerification.mockResolvedValue(
    request({ status: "PENDING_REVIEW", photoStatus: "READY" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(currentVerification).toHaveBeenCalledTimes(7);
  expect(screen.getByText("Pending staff review")).toBeTruthy();
});

test("legacy badge-only verification does not claim to make an existing ad private", () => {
  render(
    <VerificationRequestModal
      open
      listingId="already-active"
      initial={request({ status: "REJECTED" })}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/Your ad's publication status is unchanged/),
  ).toBeTruthy();
  expect(screen.queryByText(/Your ad stays private/)).toBe(null);
});
