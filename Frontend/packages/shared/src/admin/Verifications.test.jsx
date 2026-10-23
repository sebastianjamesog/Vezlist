import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Verifications from "./Verifications.jsx";
const mocks = vi.hoisted(() => ({ queueVerifications: vi.fn(), verificationDetail: vi.fn(), decideVerification: vi.fn(), toast: vi.fn() }));
vi.mock("../lib/api/adminVerification.js", () => mocks);
vi.mock("../context/AdminAuthContext", () => ({ useAdminAuth: () => ({ can: () => true }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => mocks.toast }));
vi.mock("../lib/adminScope", () => ({ useSiteScope: () => ["personals"] }));
vi.mock("../components/media/MediaImage.jsx", () => ({ default: ({ alt }) => <span>{alt}</span> }));
vi.mock("../components/admin/AdminHeader", () => ({ default: ({ title }) => <header>{title}</header> }));
const row = { id: "request", listingId: "listing", listingTitle: "Example ad", ownerEmail: "owner@example.test", site: "PERSONALS", code: "123456", submittedAt: "2026-10-23T10:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queueVerifications.mockResolvedValue([row]);
  mocks.verificationDetail.mockResolvedValue({ ...row, photoUrl: "/private-proof.jpg", media: [{ id: "first", url: "/first.jpg" }, { id: "second", url: "/second.jpg" }] });
  mocks.decideVerification.mockResolvedValue({});
});
test("staff selects exactly the photos reviewed, with no automatic all-photo approval", async () => {
  render(<Verifications />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const first = await screen.findByRole("checkbox", { name: "Verify photo 1" });
  expect(first.checked).toBe(false);
  expect(screen.getByRole("checkbox", { name: "Verify photo 2" }).checked).toBe(false);
  fireEvent.click(first);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(mocks.decideVerification).toHaveBeenCalledWith("request", { decision: "APPROVE", reason: undefined, verifiedMediaIds: ["first"] }));
});
test("a missing verification proof still prevents approval", async () => {
  mocks.verificationDetail.mockResolvedValue({ ...row, photoUrl: null, media: [] });
  render(<Verifications />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect((await screen.findByRole("button", { name: "Approve" })).disabled).toBe(true);
});
