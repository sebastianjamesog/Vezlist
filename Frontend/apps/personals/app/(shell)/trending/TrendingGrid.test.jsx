import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TrendingGrid from "./TrendingGrid.jsx";
import CreatorProfile from "../seller/[id]/CreatorProfile.jsx";
import {
  getTrendingSellers,
  getSellerProfile,
} from "@vezlist/shared/lib/api/sellers.js";
import { listLiveCreators } from "@vezlist/shared/lib/api/live.js";
import { setRoute } from "next/navigation";

vi.mock("@vezlist/shared/lib/api/sellers.js", () => ({
  getTrendingSellers: vi.fn(),
  getSellerProfile: vi.fn(),
}));
vi.mock("@vezlist/shared/lib/api/live.js", () => ({
  listLiveCreators: vi.fn(),
}));
vi.mock("@vezlist/shared/context/ReportsContext.jsx", () => ({
  useReports: () => ({
    isBlocked: () => false,
    reportOf: () => null,
    block: vi.fn(),
    unblock: vi.fn(),
  }),
}));
vi.mock("@vezlist/shared/context/ToastContext.jsx", () => ({
  useToast: () => vi.fn(),
}));
vi.mock("@vezlist/shared/components/ReportDialog.jsx", () => ({
  default: () => null,
}));
vi.mock("@vezlist/shared/components/media/MediaImage.jsx", () => ({
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));

beforeEach(() => {
  listLiveCreators
    .mockReset()
    .mockResolvedValue({
      items: [
        {
          id: "real-session",
          ownerId: "creator-1",
          creatorName: "Shared name",
          status: "LIVE",
          title: "Creator broadcast",
        },
      ],
    });
  getTrendingSellers.mockReset().mockResolvedValue([
    { id: "creator-1", displayName: "Shared name", viewCount: 3, likeCount: 1 },
    { id: "creator-2", displayName: "Shared name", viewCount: 2, likeCount: 0 },
  ]);
  getSellerProfile.mockReset().mockResolvedValue({
    seller: { id: "creator-1", displayName: "Shared name", verified: false },
    items: [],
    activeListingCount: 0,
    viewCount: 0,
    likeCount: 0,
  });
});

test("renders only backend-ranked creators and matches live badges by account ID", async () => {
  vi.stubEnv("NODE_ENV", "development");
  try {
    render(<TrendingGrid />);
    const live = await screen.findByRole("link", {
      name: /Shared name \(live now\)/,
    });
    expect(live.getAttribute("href")).toBe("/seller/creator-1");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(
      screen
        .getByRole("link", { name: /Shared name.*2 views/ })
        .getAttribute("href"),
    ).toBe("/seller/creator-2");
    expect(screen.getAllByText("Live")).toHaveLength(1);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("empty backend results stay empty in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  getTrendingSellers.mockResolvedValue([]);
  try {
    render(<TrendingGrid />);
    expect(await screen.findByText("No trending creators yet")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("a creator without ads has a real profile and a real session link without fake viewers", async () => {
  setRoute({ path: "/seller/creator-1", params: { id: "creator-1" } });
  render(<CreatorProfile />);
  expect(await screen.findByText("No posts yet")).toBeTruthy();
  const watch = await screen.findByRole("link", { name: /Creator broadcast/ });
  expect(watch.getAttribute("href")).toBe("/live/real-session");
  expect(screen.queryByText(/watching/)).toBeNull();
});
