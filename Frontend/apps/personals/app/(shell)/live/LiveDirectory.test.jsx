import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveDirectory from "./LiveDirectory.jsx";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";

vi.mock("@vezlist/shared/lib/api/live.js", () => ({
  listLiveCreators: vi.fn(),
}));
vi.mock("@vezlist/shared/components/media/MediaImage.jsx", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));

beforeEach(() => {
  listLiveCreators.mockReset().mockResolvedValue({
    total: 1,
    items: [
      {
        id: "session-1",
        status: "LIVE",
        ownerId: "creator-1",
        listingId: "ad-1",
        creatorName: "Sofia",
        title: "Late night vibes",
        location: "Calgary",
        startedAt: new Date().toISOString(),
        imageUrl: "https://example.test/actual-ad-photo.webp",
        avatarUrl: null,
      },
    ],
  });
});

test("uses live directory data and the real ad photo without invented audience metrics", async () => {
  const { container } = render(<LiveDirectory />);
  expect(await screen.findByText("Late night vibes")).toBeTruthy();
  expect(screen.getByText("1 creator online")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /Late night vibes/ }).getAttribute("href"),
  ).toBe("/live/session-1");
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://example.test/actual-ad-photo.webp",
  );
  expect(screen.queryByText(/watching/i)).toBeNull();
});

test("does not label preparing or ended sessions as live cards", async () => {
  listLiveCreators.mockResolvedValue({
    total: 0,
    items: [
      { id: "ended", status: "ENDED", title: "Old session" },
      { id: "preparing", status: "PREPARING", title: "Preparing" },
    ],
  });
  render(<LiveDirectory />);
  expect(await screen.findByText("Nobody is live right now")).toBeTruthy();
  expect(screen.queryByText("Old session")).toBeNull();
  expect(screen.queryByText("Preparing")).toBeNull();
});
