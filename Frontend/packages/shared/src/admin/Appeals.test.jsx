import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Appeals from "./Appeals";

const mocks = vi.hoisted(() => ({ queueCases: vi.fn(), caseDetail: vi.fn(), assignCase: vi.fn(), reviewCaseMedia: vi.fn(), decideCase: vi.fn(), toast: vi.fn() }));
vi.mock("../lib/api/adminModeration.js", () => mocks);
vi.mock("../context/AdminAuthContext", () => ({ useAdminAuth: () => ({ admin: { id: "admin" }, can: () => true }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("../hooks/useAdminSettings.js", () => ({ useAdminSettings: () => ({ reviewSlaHours: 2, reportSlaHours: 48 }) }));
vi.mock("../lib/adminScope", () => ({ useSiteScope: () => ["personals"] }));
vi.mock("../components/media/MediaImage.jsx", () => ({ default: () => <span>Photo</span> }));
vi.mock("../components/admin/AdminHeader", () => ({ default: ({ title, subtitle }) => <header>{title} {subtitle}</header> }));
const row = { id: "appeal", kind: "APPEAL", listing_id: "listing", title: "Test appeal", created_at: new Date().toISOString(), listing_status: "REMOVED" };
const detail = () => ({ review: { assignee: null }, policy: { eligibilityRequired: true, approvalsRequired: 2 }, media: [{ id: "photo", status: "READY", checksum_sha256: "hash", url: "/photo.jpg" }], mediaReviews: [], actions: [] });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queueCases.mockResolvedValue([row]);
  mocks.caseDetail.mockResolvedValue(detail());
  mocks.assignCase.mockResolvedValue({});
  mocks.reviewCaseMedia.mockResolvedValue({});
  mocks.decideCase.mockResolvedValue({ caseStatus: "OPEN", approvals: 1 });
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
  await waitFor(() => expect(mocks.reviewCaseMedia).toHaveBeenCalledWith("appeal", { mediaId: "photo", verdict: "BLOCK" }));
  fireEvent.click(screen.getByRole("checkbox"));
  expect(approve.disabled).toBe(true);
  await waitFor(() => expect(screen.getByRole("button", { name: "Pass" }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Pass" }));
  await waitFor(() => expect(approve.disabled).toBe(false));
  fireEvent.click(approve);
  await waitFor(() => expect(mocks.decideCase).toHaveBeenCalledWith("appeal", expect.objectContaining({ decision: "APPROVE", eligibilityChecked: true })));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("different reviewer"));
  expect(await screen.findByRole("button", { name: "Decide" })).toBeTruthy();
});
test("restores saved PASS checks and allows retry after a transient decision error", async () => {
  mocks.caseDetail.mockResolvedValue({ ...detail(), mediaReviews: [{ media_id: "photo", reviewer_id: "admin", checksum_sha256: "hash", verdict: "PASS" }] });
  mocks.decideCase.mockRejectedValueOnce(new Error("temporary"));
  await open();
  fireEvent.click(screen.getByRole("checkbox"));
  const approve = screen.getByRole("button", { name: "Overturn" });
  expect(approve.disabled).toBe(false);
  fireEvent.click(approve);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Overturn" }).disabled).toBe(false);
});
test("does not let the same reviewer approve twice", async () => {
  mocks.caseDetail.mockResolvedValue({ ...detail(), actions: [{ action: "APPROVE", actor_id: "admin" }] });
  render(<Appeals />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByText(/Your approval is recorded/);
  expect(screen.queryByRole("button", { name: "Overturn" })).toBeNull();
  expect(mocks.assignCase).not.toHaveBeenCalled();
});

test("submission queue uses approval and rejection actions with a real completion message", async () => {
  mocks.queueCases.mockResolvedValue([{ ...row, kind: "SUBMISSION" }]);
  mocks.caseDetail.mockResolvedValue({ ...detail(), policy: { eligibilityRequired: false, approvalsRequired: 1 }, listing: { description: "Pending test listing" } });
  mocks.decideCase.mockResolvedValue({ caseStatus: "CLOSED", listingStatus: "ACTIVE", approvals: 1 });
  render(<Appeals kind="SUBMISSION" />);
  fireEvent.click(await screen.findByRole("button", { name: "Decide" }));
  await screen.findByRole("button", { name: "Approve" });
  expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pass" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Approve" }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Submission approved - ad published"));
});
