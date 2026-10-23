import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import MyAds from "./MyAds.jsx";
import { ownedListings } from "../lib/api/listings.js";
import { ownerStatus, appeal } from "../lib/api/moderation.js";
import { ApiError } from "../lib/api/client.js";
const state = vi.hoisted(() => ({
  user: { id: "owner-a" },
  site: "MARKETPLACE",
  toast: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: state.user }),
}));
vi.mock("../context/AccountContext", () => ({
  useAccount: () => ({ can: () => true }),
}));
vi.mock("../context/ToastContext", () => ({ useToast: () => state.toast }));
vi.mock("../components/RequireCapability", () => ({
  default: ({ children }) => children,
}));
vi.mock("../components/create/VerificationRequestModal", () => ({
  default: () => null,
}));
vi.mock("../components/create/StepDetails", () => ({ default: () => null }));
vi.mock("../components/create/StepContact", () => ({ default: () => null }));
vi.mock("../lib/api/client.js", async (original) => ({
  ...(await original()),
  get SITE_SCOPE() {
    return state.site;
  },
}));
vi.mock("../lib/api/listings.js", () => ({
  ownedListings: vi.fn(),
  deleteListing: vi.fn(),
  submitListing: vi.fn(),
  updateListing: vi.fn(),
}));
vi.mock("../lib/api/moderation.js", () => ({
  ownerStatus: vi.fn(),
  appeal: vi.fn(),
}));
const row = {
  id: "listing-a",
  title: "My removed ad",
  status: "REMOVED",
  viewCount: 0,
  saveCount: 0,
  media: [],
};
const allowed = {
  listingId: row.id,
  status: "REMOVED",
  appealAllowed: true,
  appealStatus: "NONE",
  publicReason: "Wrong category.",
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.resetAllMocks();
  state.user = { id: "owner-a" };
  state.site = "MARKETPLACE";
  ownedListings.mockResolvedValue([row]);
  ownerStatus.mockImplementation(async () =>
    appeal.mock.calls.length
      ? { ...allowed, appealAllowed: false, appealStatus: "PENDING" }
      : allowed,
  );
});
async function openAppeal() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Needs attention/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Appeal the decision/ }),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Please reconsider this decision." },
  });
  return screen.getByRole("button", { name: "Submit appeal" });
}
test("submits once, locks composer and close, then displays pending feedback", async () => {
  const pending = deferred();
  appeal.mockReturnValue(pending.promise);
  render(<MyAds />);
  const submit = await openAppeal();
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(appeal).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("textbox").disabled).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(
    screen.getByRole("dialog", { name: "Appeal this decision" }),
  ).toBeTruthy();
  await act(async () => pending.resolve({ id: "appeal-a" }));
  expect(await screen.findByText(/Appeal pending review/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Appeal the decision/ }),
  ).toBeNull();
});
test("failed submission preserves text and exposes retryable inline error", async () => {
  appeal
    .mockRejectedValueOnce(
      new ApiError({
        status: 429,
        code: "LIMIT",
        message: "Too many appeals. Try tomorrow.",
      }),
    )
    .mockResolvedValue({ id: "appeal-a" });
  render(<MyAds />);
  fireEvent.click(await openAppeal());
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Too many appeals. Try tomorrow.",
  );
  expect(screen.getByRole("textbox").value).toBe(
    "Please reconsider this decision.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit appeal" }));
  expect(await screen.findByText(/Appeal pending review/)).toBeTruthy();
  expect(appeal).toHaveBeenCalledTimes(2);
});
test("status retrieval failure is visible and retry restores server eligibility", async () => {
  ownerStatus
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(allowed);
  render(<MyAds />);
  fireEvent.click(
    await screen.findByRole("button", { name: /Needs attention/ }),
  );
  expect(
    await screen.findByText(/Could not load moderation status/),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Appeal the decision/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry status" }));
  expect(
    await screen.findByRole("button", { name: /Appeal the decision/ }),
  ).toBeTruthy();
});
test.each([
  ["APPROVED", "ACTIVE", /Your appeal was approved/],
  ["REJECTED", "REMOVED", /Your appeal was rejected/],
  ["STALE", "REMOVED", /appeal was superseded/],
])(
  "shows %s outcome from owner status",
  async (appealStatus, status, message) => {
    ownedListings.mockResolvedValue([{ ...row, status }]);
    ownerStatus.mockResolvedValue({
      ...allowed,
      appealAllowed: false,
      appealStatus,
    });
    render(<MyAds />);
    if (status !== "ACTIVE")
      fireEvent.click(
        await screen.findByRole("button", { name: /Needs attention/ }),
      );
    expect(await screen.findByText(message)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Appeal the decision/ }),
    ).toBeNull();
  },
);
test.each(["account", "site"])(
  "switching %s clears previous owner draft and ignores late submission",
  async (change) => {
    const pending = deferred();
    appeal.mockReturnValue(pending.promise);
    const view = render(<MyAds />);
    fireEvent.click(await openAppeal());
    ownedListings.mockResolvedValue([]);
    if (change === "account") state.user = { id: "owner-b" };
    else state.site = "PERSONALS";
    view.rerender(<MyAds />);
    expect(await screen.findByText("No active ads")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => pending.resolve({ id: "appeal-a" }));
    expect(state.toast).not.toHaveBeenCalled();
    expect(screen.queryByText(/Appeal pending review/)).toBeNull();
  },
);
test("late previous-account listing response cannot replace current account ads", async () => {
  const old = deferred();
  ownedListings.mockReturnValueOnce(old.promise).mockResolvedValue([]);
  const view = render(<MyAds />);
  state.user = { id: "owner-b" };
  view.rerender(<MyAds />);
  expect(await screen.findByText("No active ads")).toBeTruthy();
  await act(async () => old.resolve([row]));
  expect(screen.queryByText(row.title)).toBeNull();
  expect(ownerStatus).not.toHaveBeenCalled();
});
test("background status started before submission cannot restore appeal eligibility", async () => {
  const old = deferred();
  render(<MyAds />);
  const submit = await openAppeal();
  ownerStatus.mockReturnValueOnce(old.promise);
  fireEvent.focus(window);
  await waitFor(() => expect(ownerStatus).toHaveBeenCalledTimes(2));
  appeal.mockResolvedValue({ id: "appeal-a" });
  fireEvent.click(submit);
  expect(await screen.findByText(/Appeal pending review/)).toBeTruthy();
  await act(async () => old.resolve(allowed));
  expect(
    screen.queryByRole("button", { name: /Appeal the decision/ }),
  ).toBeNull();
});

test.each(["APPROVED", "REJECTED"])(
  "idempotent successful POST displays authoritative %s outcome immediately",
  async (appealStatus) => {
    appeal.mockResolvedValue({ id: "existing-appeal" });
    render(<MyAds />);
    const submit = await openAppeal();
    ownerStatus.mockResolvedValue({
      ...allowed,
      appealAllowed: false,
      appealStatus,
      status: appealStatus === "APPROVED" ? "ACTIVE" : "REMOVED",
    });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getAllByText(
        appealStatus === "APPROVED"
          ? "Your appeal was approved."
          : /Your appeal was rejected/,
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Appeal pending review/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Appeal the decision/ }),
    ).toBeNull();
    expect(appeal).toHaveBeenCalledTimes(1);
  },
);

test("successful submission with failed status refresh stays pending without resending", async () => {
  appeal.mockResolvedValue({ id: "new-appeal" });
  render(<MyAds />);
  const submit = await openAppeal();
  ownerStatus.mockRejectedValue(new Error("Offline"));
  fireEvent.click(submit);
  expect(await screen.findByText(/Appeal pending review/)).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Appeal the decision/ }),
  ).toBeNull();
  expect(appeal).toHaveBeenCalledTimes(1);
});
