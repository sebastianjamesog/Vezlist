import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import AdPhotoGallery from "./AdPhotoGallery.jsx";
vi.mock("./MediaImage.jsx", () => ({ default: ({ src, alt }) => <img src={src} alt={alt} /> }));
const photos = [{ url: "/approved.jpg", verified: true }, { url: "/ordinary.jpg", verified: false }];

test("verification belongs to the selected photo, with distinct thumbnail groups", () => {
  render(<AdPhotoGallery photos={photos} title="Example ad" />);
  expect(screen.getByText(/this photo has been confirmed/)).toBeTruthy();
  expect(within(screen.getByLabelText("Verified pictures")).getAllByRole("button")).toHaveLength(1);
  expect(within(screen.getByLabelText("Non-verified pictures")).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Show photo 2" }));
  expect(screen.queryByText(/this photo has been confirmed/)).toBeNull();
  expect(screen.queryByText("Verified")).toBeNull();
  expect(screen.getByRole("button", { name: "Open photo 2 of 2 full screen" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
  expect(screen.getByText(/this photo has been confirmed/)).toBeTruthy();
});

test("legacy URL-only photos are never described as verified", () => {
  render(<AdPhotoGallery photos={["/legacy.jpg"]} title="Legacy ad" />);
  expect(screen.queryByText(/this photo has been confirmed/)).toBeNull();
  expect(screen.queryByText("Verified pictures")).toBeNull();
  expect(screen.getByText("Non-verified pictures")).toBeTruthy();
});

test("inline ad swipe is preserved while a photo is displayed", () => {
  const next = vi.fn();
  render(<AdPhotoGallery photos={photos} title="Example ad" onSwipeAd={next} />);
  const gallery = document.querySelector("[data-photo-gallery]");
  fireEvent.touchStart(gallery, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(gallery, { changedTouches: [{ clientX: 50, clientY: 105 }] });
  expect(next).toHaveBeenCalledWith(1);
});
