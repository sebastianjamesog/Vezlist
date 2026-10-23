import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Appeals from "./Appeals";

const mocks = vi.hoisted(() => ({
  queueCases: vi.fn(),
  caseDetail: vi.fn(),
  assignCase: vi.fn(),
  reviewCaseMedia: vi.fn(),
  decideCase: vi.fn(),
  toast: vi.fn(),
  site: "personals",
  admin: { id: "admin", role: "owner" },
}));
vi.mock("../lib/api/adminModeration.js", () => mocks);
vi.mock("../context/AdminAuthContext", () => ({
  useAdminAuth: () => ({ admin: mocks.admin, can: () => true }),
}));
vi.mock("../context/ToastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("../hooks/useAdminSettings.js", () => ({
  useAdminSettings: () => ({ reviewSlaHours: 2, reportSlaHours: 48 }),
}));
vi.mock("../lib/adminScope", () => ({ useSiteScope: () => [mocks.site] }));
vi.mock("../components/media/MediaImage.jsx", () => ({
  default: () => <span>Photo</span>,
}));
vi.mock("../components/admin/AdminHeader", () => ({
  default: ({ title, subtitle, actions }) => (
    <header>
      {title} {subtitle}
      {actions}
    </header>
  ),
}));
const row = {
  id: "appeal",
  kind: "APPEAL",
  listing_id: "listing",
  title: "Test appeal",
  created_at: new Date().toISOString(),
  listing_status: "REMOVED",
};
const detail = () => ({
  review: { assignee: null },
  policy: { eligibilityRequired: true, approvalsRequired: 2 },
  media: [
    {
      id: "photo",
      status: "READY",
      checksum_sha256: "hash",
      url: "/photo.jpg",
    },
  ],
  mediaReviews: [],
  actions: [],
});

test("refresh loads newly submitted appeals without leaving the queue", async () => {
  mocks.queueCases.mockResolvedValueOnce([]);
  render(<Appeals />);
  await screen.findByText("No appeals");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByRole("button", { name: "Decide" })).toBeTruthy();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.site = "personals";
  mocks.admin = { id: "admin", role: "owner" };
  mocks.queueCases.mockResolvedValue([row]);
  mocks.caseDetail.mockResolvedValue(detail());
  mocks.assignCase.mockResolvedValue({});
  mocks.reviewCaseMedia.mockResolvedValue({});
  mocks.decideCase.mockResolvedValue({ caseStatus: "OPEN", approvals: 1 });
});

test("owner can explicitly recover a review assigned to another reviewer", async () => {
  mocks.caseDetail.mockResolvedValueOnce({
    ...detail(),
    review: { assignee: "other", status: "OPEN" },
  });
  render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Take over review" }),
  );
  await screen.findByRole("button", { name: "Overturn" });
  expect(mocks.assignCase).toHaveBeenCalledWith("appeal", "admin");
});

test("moderator cannot take over another review and own ads cannot be claimed", async () => {
  mocks.admin = { id: "admin", role: "moderator" };
  mocks.caseDetail.mockResolvedValue({
    ...detail(),
    review: { assignee: "other" },
  });
  render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByText(/already assigned/);
  expect(screen.queryByRole("button", { name: "Take over review" })).toBeNull();
  expect(mocks.assignCase).not.toHaveBeenCalled();
});

test("own listing and closed appeals remain read-only", async () => {
  mocks.caseDetail.mockResolvedValue({
    ...detail(),
    listing: { owner_id: "admin", publicReason: "Original reason" },
  });
  render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByText(/cannot review your own ad/);
  expect(screen.getByText("Original reason")).toBeTruthy();
  expect(mocks.assignCase).not.toHaveBeenCalled();
  mocks.caseDetail.mockResolvedValue({
    ...detail(),
    review: { status: "CLOSED" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reload case" }));
  await screen.findByText(/already been decided/);
  expect(mocks.assignCase).not.toHaveBeenCalled();
});

test("switching site discards an old detail request before it can claim the case", async () => {
  let resolve;
  mocks.caseDetail.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  mocks.site = "marketplace";
  view.rerender(<Appeals />);
  resolve(detail());
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.assignCase).not.toHaveBeenCalled();
});

test("late decision failure cannot appear under a different admin account", async () => {
  let reject;
  mocks.decideCase.mockReturnValue(
    new Promise((_, r) => {
      reject = r;
    }),
  );
  const view = render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  fireEvent.click(await screen.findByRole("button", { name: "Uphold" }));
  mocks.admin = { id: "other", role: "owner" };
  view.rerender(<Appeals />);
  reject(new Error("Old request failed"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});
async function open() {
  render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByRole("button", { name: "Overturn" });
}
test("requires passed media and eligibility; keeps an appeal open after the first approval", async () => {
  await open();
  const approve = screen.getByRole("button", { name: "Overturn" });
  expect(approve.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  await waitFor(() =>
    expect(mocks.reviewCaseMedia).toHaveBeenCalledWith("appeal", {
      mediaId: "photo",
      verdict: "BLOCK",
    }),
  );
  fireEvent.click(screen.getByRole("checkbox"));
  expect(approve.disabled).toBe(true);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Pass" }).disabled).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Pass" }));
  await waitFor(() => expect(approve.disabled).toBe(false));
  fireEvent.click(approve);
  await waitFor(() =>
    expect(mocks.decideCase).toHaveBeenCalledWith(
      "appeal",
      expect.objectContaining({
        decision: "APPROVE",
        eligibilityChecked: true,
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.toast).toHaveBeenCalledWith(
    expect.stringContaining("different reviewer"),
  );
  expect(await screen.findByRole("button", { name: "Decide" })).toBeTruthy();
});
test("restores saved PASS checks and allows retry after a transient decision error", async () => {
  mocks.caseDetail.mockResolvedValue({
    ...detail(),
    mediaReviews: [
      {
        media_id: "photo",
        reviewer_id: "admin",
        checksum_sha256: "hash",
        verdict: "PASS",
      },
    ],
  });
  mocks.decideCase.mockRejectedValueOnce(new Error("temporary"));
  await open();
  fireEvent.click(screen.getByRole("checkbox"));
  const approve = screen.getByRole("button", { name: "Overturn" });
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Overturn" }).disabled).toBe(false);
});

test("a retried approval reports the final rejection if another reviewer already closed the appeal", async () => {
  mocks.caseDetail.mockResolvedValue({ ...detail(), mediaReviews: [{ media_id:"photo", reviewer_id:"admin", checksum_sha256:"hash", verdict:"PASS" }] });
  mocks.decideCase.mockResolvedValue({caseStatus:"CLOSED",listingStatus:"REMOVED",approvals:1});
  await open();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button",{name:"Overturn"}));
  await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith("Appeal rejected - decision stands"));
  expect(mocks.toast).not.toHaveBeenCalledWith("Appeal overturned - ad reinstated");
});
test("does not let the same reviewer approve twice", async () => {
  mocks.caseDetail.mockResolvedValue({
    ...detail(),
    actions: [{ action: "APPROVE", actor_id: "admin" }],
  });
  render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByText(/Your approval is recorded/);
  expect(screen.queryByRole("button", { name: "Overturn" })).toBeNull();
  expect(mocks.assignCase).not.toHaveBeenCalled();
});

test("submission queue uses approval and rejection actions with a real completion message", async () => {
  mocks.queueCases.mockResolvedValue([{ ...row, kind: "SUBMISSION" }]);
  mocks.caseDetail.mockResolvedValue({
    ...detail(),
    policy: { eligibilityRequired: false, approvalsRequired: 1 },
    listing: { description: "Pending test listing" },
  });
  mocks.decideCase.mockResolvedValue({
    caseStatus: "CLOSED",
    listingStatus: "ACTIVE",
    approvals: 1,
  });
  render(<Appeals kind="SUBMISSION" />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByRole("button", { name: "Approve" });
  expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pass" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Approve" }).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      "Submission approved - ad published",
    ),
  );
});
