import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import AppLayout from "./AppLayout.jsx";
import { publishDraft } from "../../lib/api/listings.js";
import { requestVerification } from "../../lib/api/verification.js";

vi.mock("../../context/AccountContext", () => ({
  useAccount: () => ({ can: () => true, signedIn: true }),
}));
vi.mock("../../lib/api/listings.js", () => ({ publishDraft: vi.fn() }));
vi.mock("../../lib/api/verification.js", () => ({
  requestVerification: vi.fn(),
  currentVerification: vi.fn(),
  uploadVerificationPhoto: vi.fn(),
}));
vi.mock("./Sidebar", () => ({
  default: ({ onPostAd }) => <button onClick={onPostAd}>Post an ad</button>,
}));
vi.mock("./BottomNav", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("../create/CreateMenu", () => ({
  default: () => null,
  HAS_CREATE_MENU: false,
}));
vi.mock("../create/StoryComposer", () => ({ default: () => null }));
vi.mock("../create/CreateAdSheet", () => ({
  default: ({ open, onPublish }) =>
    open && (
      <>
        <button
          onClick={() =>
            onPublish(
              { title: "New ad" },
              { requestVerification: false },
            ).catch(() => {})
          }
        >
          Regular publish
        </button>
        <button
          onClick={() =>
            onPublish({ title: "New ad" }, { requestVerification: true }).catch(
              () => {},
            )
          }
        >
          Verified publish
        </button>
      </>
    ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
const open = () => {
  render(
    <AppLayout>
      <p>Feed</p>
    </AppLayout>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Post an ad" }));
};

test("regular ads submit as regular and the server's ACTIVE response is shown as live", async () => {
  publishDraft.mockResolvedValue({
    id: "regular",
    status: "ACTIVE",
    verificationRequested: false,
  });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Regular publish" }));
  expect(
    await screen.findByText("Your ad is live — find it in My Ads under Active"),
  ).toBeTruthy();
  expect(publishDraft).toHaveBeenCalledWith(
    { title: "New ad" },
    { requestVerification: false },
  );
  expect(requestVerification).not.toHaveBeenCalled();
  expect(screen.queryByText(/Ad submitted.*In review/)).toBe(null);
});

test("verified intent reaches submission before a code is requested and the ad stays private", async () => {
  publishDraft.mockResolvedValue({
    id: "private",
    status: "PENDING_REVIEW",
    verificationRequested: true,
  });
  requestVerification.mockResolvedValue({
    id: "request",
    status: "AWAITING_PHOTO",
    photoStatus: "NONE",
    code: "123456",
  });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Verified publish" }));
  expect(await screen.findByText("123456")).toBeTruthy();
  expect(publishDraft).toHaveBeenCalledWith(
    { title: "New ad" },
    { requestVerification: true },
  );
  expect(requestVerification).toHaveBeenCalledWith("private");
  expect(publishDraft.mock.invocationCallOrder[0]).toBeLessThan(
    requestVerification.mock.invocationCallOrder[0],
  );
  expect(
    screen.getByText("Your ad is private until verification is approved"),
  ).toBeTruthy();
});

test("a code-request failure reports the saved private ad and recovery from My Ads", async () => {
  publishDraft.mockResolvedValue({
    id: "private",
    status: "PENDING_REVIEW",
    verificationRequested: true,
  });
  requestVerification.mockRejectedValue(new Error("Offline"));
  open();
  fireEvent.click(screen.getByRole("button", { name: "Verified publish" }));
  expect(
    await screen.findByText(
      "Couldn't start verification. Your ad is private; continue verification from My Ads.",
    ),
  ).toBeTruthy();
  expect(publishDraft).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Verified publish" })).toBe(null);
});

test("an unsuccessful submission leaves the create flow open without requesting verification", async () => {
  publishDraft.mockRejectedValue(new Error("Upload failed"));
  open();
  fireEvent.click(screen.getByRole("button", { name: "Verified publish" }));
  await Promise.resolve();
  expect(screen.getByRole("button", { name: "Verified publish" })).toBeTruthy();
  expect(requestVerification).not.toHaveBeenCalled();
});

test("legacy pending responses are described as review without falsely claiming a verification request", async () => {
  publishDraft.mockResolvedValue({
    id: "legacy",
    status: "PENDING_REVIEW",
    verificationRequested: false,
  });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Regular publish" }));
  expect(
    await screen.findByText("Your ad is in review — check My Ads for updates"),
  ).toBeTruthy();
  expect(requestVerification).not.toHaveBeenCalled();
  expect(
    screen.queryByText("Your ad is private until verification is approved"),
  ).toBe(null);
});
