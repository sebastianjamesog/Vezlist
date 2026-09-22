import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, ApiError, SITE_SCOPE } from "./client.js";
import { uploadListingImage } from "./media.js";

const ready = {
  id: "media-1",
  status: "READY",
  url: "https://media.example/photo.jpg",
};
const processing = { id: "media-1", status: "PROCESSING" };
const blob = {
  type: "image/png",
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("crypto", {
    subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
  });
  vi.spyOn(api, "post").mockImplementation(async (path) =>
    path.endsWith("/upload-url")
      ? { mediaId: "media-1", alreadyUploaded: true }
      : processing,
  );
  vi.spyOn(api, "get").mockResolvedValue({ media: [ready] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("upload waits for its own processed image before returning", async () => {
  api.get
    .mockResolvedValueOnce({
      media: [processing, { id: "other", status: "READY" }],
    })
    .mockResolvedValueOnce({ media: [ready] });
  let finished = false;
  const result = uploadListingImage("listing-1", blob, "photo.png").then(
    (media) => {
      finished = true;
      return media;
    },
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toEqual(ready);
  expect(api.get).toHaveBeenCalledWith("/api/v1/listings/listing-1", {
    site: SITE_SCOPE,
  });
});

test("already-ready completion does not poll", async () => {
  api.post
    .mockResolvedValueOnce({ mediaId: "media-1", alreadyUploaded: true })
    .mockResolvedValueOnce(ready);
  expect(await uploadListingImage("listing-1", blob, "photo.png")).toEqual(
    ready,
  );
  expect(api.get).not.toHaveBeenCalled();
});

test("rejected image stops publication with the processing reason", async () => {
  api.get.mockResolvedValue({
    media: [
      {
        id: "media-1",
        status: "REJECTED",
        rejectionReason: "Unsupported image bytes",
      },
    ],
  });
  const result = uploadListingImage("listing-1", blob, "photo.png");
  const rejected = expect(result).rejects.toMatchObject({
    code: "MEDIA_REJECTED",
    message: "Unsupported image bytes",
  });
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
});

test("processing has a bounded timeout and directs the owner to their saved draft", async () => {
  api.get.mockResolvedValue({ media: [processing] });
  const result = uploadListingImage("listing-1", blob, "photo.png");
  const rejected = expect(result).rejects.toMatchObject({
    code: "MEDIA_PROCESSING_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(api.get).toHaveBeenCalledTimes(30);
});

test("polling preserves API failures instead of submitting an unprocessed image", async () => {
  api.get.mockRejectedValue(
    new ApiError({ status: 403, message: "Access denied" }),
  );
  const result = uploadListingImage("listing-1", blob, "photo.png");
  const rejected = expect(result).rejects.toMatchObject({ status: 403 });
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
});
