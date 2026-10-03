import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoryComposer from "./StoryComposer";
import {
  deleteStory,
  listMyStories,
  listStoryPlans,
  publishStory,
  uploadStory,
} from "../../lib/api/stories";
const refreshStories = vi.fn();
const account = { signedIn: true, can: () => true };
vi.mock("../../context/AccountContext", () => ({ useAccount: () => account }));
vi.mock("../../context/StatusContext", () => ({
  useStatus: () => ({ refreshStories }),
}));
vi.mock("../../context/ToastContext", () => ({ useToast: () => vi.fn() }));
vi.mock("../../lib/nav", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../lib/media", () => ({
  downscaleToDataUri: vi.fn().mockResolvedValue("data:image/jpeg;base64,YQ=="),
}));
vi.mock("../../lib/api/media", () => ({
  dataUriToBlob: () => new Blob(["photo"], { type: "image/jpeg" }),
}));
vi.mock("../../lib/api/stories", () => ({
  listMyStories: vi.fn(),
  listStoryPlans: vi.fn(),
  publishStory: vi.fn(),
  uploadStory: vi.fn(),
  deleteStory: vi.fn(),
}));
const paidPlan = {
  id: "plan-1",
  name: "Single Story",
  price: 5,
  currency: "CAD",
  storyCount: 1,
  enabled: true,
  version: 2,
};
const draft = {
  id: "draft-1",
  mediaUrl: "https://example.com/photo.jpg",
  mediaType: "IMAGE",
  status: "READY",
};
describe("StoryComposer backend publishing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account.signedIn = true;
    account.can = () => true;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:preview");
    URL.revokeObjectURL = vi.fn();
    listStoryPlans.mockResolvedValue({
      items: [paidPlan],
      paymentAvailable: false,
    });
    listMyStories.mockResolvedValue({ items: [draft], credits: 0 });
    refreshStories.mockResolvedValue(undefined);
    publishStory.mockResolvedValue({ ...draft, status: "PUBLISHED" });
    uploadStory.mockResolvedValue(draft);
    deleteStory.mockResolvedValue(undefined);
  });
  async function openPayment() {
    const user = userEvent.setup();
    render(<StoryComposer onClose={vi.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: /Photo draft 1/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    return user;
  }
  test("paid packs cannot publish while gateway is unavailable", async () => {
    const user = await openPayment();
    await user.click(screen.getByRole("radio", { name: /Single Story/ }));
    expect(screen.getByRole("button", { name: "Pay $5.00" }).disabled).toBe(
      true,
    );
    expect(screen.getByText("Payments coming soon")).toBeTruthy();
    expect(publishStory).not.toHaveBeenCalled();
    expect(screen.queryByText("Your story is live!")).toBeNull();
  });
  test("server-enabled demo checkout publishes without collecting payment", async () => {
    listStoryPlans.mockResolvedValue({
      items: [paidPlan],
      paymentAvailable: false,
      demoPurchaseAvailable: true,
    });
    const user = await openPayment();
    expect(screen.getByText("Demo purchase \u2014 no charge")).toBeTruthy();
    expect(
      screen.queryByRole("radiogroup", { name: "Payment method" }),
    ).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Single Story/ }));
    await user.click(
      screen.getByRole("button", { name: "Demo purchase & publish" }),
    );
    expect(publishStory).toHaveBeenCalledWith("draft-1", {
      planId: "plan-1",
      planVersion: 2,
      useCredit: false,
      demoPurchase: true,
    });
    expect(await screen.findByText("Your story is live!")).toBeTruthy();
    expect(screen.queryByText(/Payment successful/i)).toBeNull();
  });

  test("conflict reload can disable demo purchasing before another attempt", async () => {
    listStoryPlans.mockResolvedValueOnce({
      items: [paidPlan],
      paymentAvailable: false,
      demoPurchaseAvailable: true,
    });
    publishStory.mockRejectedValue(
      Object.assign(new Error("Plan changed"), { status: 409 }),
    );
    const user = await openPayment();
    await user.click(screen.getByRole("radio", { name: /Single Story/ }));
    await user.click(
      screen.getByRole("button", { name: "Demo purchase & publish" }),
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("Demo purchase \u2014 no charge")).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Single Story/ }));
    expect(screen.getByRole("button", { name: "Pay $5.00" }).disabled).toBe(
      true,
    );
    expect(publishStory).toHaveBeenCalledTimes(1);
  });

  test("existing credit publishing does not send a demo purchase flag", async () => {
    listStoryPlans.mockResolvedValue({
      items: [paidPlan],
      paymentAvailable: false,
      demoPurchaseAvailable: true,
    });
    listMyStories.mockResolvedValue({ items: [draft], credits: 2 });
    const user = await openPayment();
    await user.click(screen.getByRole("button", { name: "Publish story" }));
    expect(publishStory).toHaveBeenCalledWith("draft-1", { useCredit: true });
    expect(await screen.findByText("Your story is live!")).toBeTruthy();
  });

  test("free plan publishes only after server success with plan version", async () => {
    listStoryPlans.mockResolvedValue({
      items: [{ ...paidPlan, price: 0 }],
      paymentAvailable: false,
    });
    const user = await openPayment();
    await user.click(screen.getByRole("radio", { name: /Single Story/ }));
    await user.click(screen.getByRole("button", { name: "Publish story" }));
    expect(publishStory).toHaveBeenCalledWith("draft-1", {
      planId: "plan-1",
      planVersion: 2,
      useCredit: false,
    });
    expect(await screen.findByText("Your story is live!")).toBeTruthy();
    expect(refreshStories).toHaveBeenCalledOnce();
  });
  test("changed plan resets selection and never shows success", async () => {
    listStoryPlans.mockResolvedValue({
      items: [{ ...paidPlan, price: 0 }],
      paymentAvailable: false,
    });
    publishStory.mockRejectedValue(
      Object.assign(new Error("Plan changed"), { status: 409 }),
    );
    const user = await openPayment();
    await user.click(screen.getByRole("radio", { name: /Single Story/ }));
    await user.click(screen.getByRole("button", { name: "Publish story" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("changed"),
    );
    expect(screen.getByRole("radio", { name: /Single Story/ }).checked).toBe(
      false,
    );
    expect(screen.queryByText("Your story is live!")).toBeNull();
  });
  test("failed upload keeps selected media and does not enter checkout", async () => {
    uploadStory.mockRejectedValue(new Error("Storage unavailable"));
    const user = userEvent.setup();
    const { container } = render(<StoryComposer onClose={vi.fn()} />);
    await screen.findByText("Saved drafts");
    await user.upload(
      container.querySelector('input[aria-label="Add media from gallery"]'),
      new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Storage unavailable",
    );
    expect(screen.getAllByAltText("Story preview").length).toBeGreaterThan(0);
    expect(screen.queryByText("Choose a plan")).toBeNull();
    expect(publishStory).not.toHaveBeenCalled();
  });
  test("browsing accounts cannot upload or load their story drafts", () => {
    account.can = () => false;
    render(<StoryComposer onClose={vi.fn()} />);
    expect(screen.getByText("Ad creators can post stories")).toBeTruthy();
    expect(listMyStories).not.toHaveBeenCalled();
  });

  test("initial loading failure offers retry and prevents starting an upload with an unavailable catalog", async () => {
    listStoryPlans.mockRejectedValueOnce(new Error("Plans unavailable"));
    const user = userEvent.setup();
    render(<StoryComposer onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Try again" });
    expect(
      screen.queryByRole("button", { name: "Add from Gallery" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Photo draft 1/ }),
    ).toBeTruthy();
    expect(listStoryPlans).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("interrupted uploads can be removed but cannot proceed to payment", async () => {
    listMyStories.mockResolvedValue({
      items: [
        { ...draft, id: "incomplete-1", mediaUrl: null, status: "UPLOADING" },
      ],
      credits: 0,
    });
    const user = userEvent.setup();
    render(<StoryComposer onClose={vi.fn()} />);
    const incomplete = await screen.findByRole("button", {
      name: /Photo incomplete upload 1/,
    });
    expect(incomplete.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
    expect(screen.queryByAltText("Story preview")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Delete draft 1" }));
    expect(deleteStory).toHaveBeenCalledWith("incomplete-1");
    await waitFor(() => expect(screen.queryByText("Saved drafts")).toBeNull());
    expect(uploadStory).not.toHaveBeenCalled();
  });
});
