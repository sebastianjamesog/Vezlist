import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import AdPopup from "./AdPopup.jsx";
import { getListingDetail } from "../lib/api/discovery.js";
vi.mock("../lib/api/discovery.js", () => ({ getListingDetail: vi.fn() }));
vi.mock("../pages/AdDetail.jsx", () => ({
  default: ({ listingId, headerActions, loadDetail }) => {
    useEffect(() => {
      loadDetail(listingId);
    }, [listingId]);
    return (
      <>
        {headerActions}
        <h1>Ad {listingId}</h1>
      </>
    );
  },
}));
beforeEach(() => {
  getListingDetail.mockReset().mockResolvedValue({});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

test("moves through the feed snapshot and reuses adjacent prefetched details", async () => {
  const user = userEvent.setup();
  render(<AdPopup ids={["a", "b", "c"]} index={0} onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Previous ad" }).disabled).toBe(
    true,
  );
  await waitFor(() => expect(getListingDetail).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("button", { name: "Next ad" }));
  expect(screen.getByRole("heading", { name: "Ad b" })).toBeTruthy();
  await waitFor(() => expect(getListingDetail).toHaveBeenCalledTimes(3));
  await user.click(screen.getByRole("button", { name: "Next ad" }));
  expect(screen.getByRole("heading", { name: "Ad c" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next ad" }).disabled).toBe(true);
  expect(getListingDetail).toHaveBeenCalledTimes(3);
});

test("single-ad popup still closes through X or Escape", async () => {
  const close = vi.fn();
  render(<AdPopup ids={["a"]} index={0} onClose={close} />);
  expect(screen.getByRole("button", { name: "Next ad" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close ad" }));
  expect(close).toHaveBeenCalledOnce();
  fireEvent(screen.getByRole("dialog", { name: "Ad viewer" }), new Event("cancel", { bubbles: false, cancelable: true }));
  expect(close).toHaveBeenCalledTimes(2);
});
