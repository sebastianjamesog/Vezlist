import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import useLiveViewCount from "./useLiveViewCount.js";
import { getListingViewCounts } from "./api/views.js";

vi.mock("./api/views.js", () => ({ getListingViewCounts: vi.fn() }));

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

function Count({ id, initialCount }) {
  const count = useLiveViewCount(id, initialCount, "MARKETPLACE");
  return <span data-testid={id}>{count ?? "—"}</span>;
}

afterEach(() => {
  vi.useRealTimers();
  getListingViewCounts.mockReset();
});

test("batches visible card counts and refreshes them while the feed stays open", async () => {
  vi.useFakeTimers();
  getListingViewCounts
    .mockResolvedValueOnce({ [firstId]: 3, [secondId]: 8 })
    .mockResolvedValueOnce({ [firstId]: 4, [secondId]: 9 });

  const view = render(
    <>
      <Count id={firstId} initialCount={2} />
      <Count id={secondId} initialCount={7} />
    </>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(getListingViewCounts).toHaveBeenCalledTimes(1);
  expect(getListingViewCounts).toHaveBeenCalledWith(
    [firstId, secondId],
    "MARKETPLACE",
  );
  expect(screen.getByTestId(firstId).textContent).toBe("3");
  expect(screen.getByTestId(secondId).textContent).toBe("8");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(getListingViewCounts).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId(firstId).textContent).toBe("4");
  expect(screen.getByTestId(secondId).textContent).toBe("9");
  view.unmount();
});
