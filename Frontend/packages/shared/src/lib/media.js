import { api } from "./api.js";
import { SITE } from "./sites.js";

const READY_TIMEOUT_MS = 30_000;

export async function fileSha256(file) {
  const bytes = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function syncListingMedia(
  listingId,
  images,
  removedMediaIds = [],
  onProgress = () => {},
) {
  for (const mediaId of removedMediaIds) {
    onProgress("Removing old photos...");
    await api("/listings/" + listingId + "/media/" + mediaId, {
      method: "DELETE",
    });
  }

  const uploaded = new Map();
  const newImages = images.filter((image) => image.file && !image.mediaId);
  for (let index = 0; index < newImages.length; index++) {
    const image = newImages[index];
    onProgress(
      "Uploading photo " + (index + 1) + " of " + newImages.length + "...",
    );
    const checksumSha256 = await fileSha256(image.file);
    const authorization = await api(
      "/listings/" + listingId + "/media/upload-url",
      {
        method: "POST",
        body: {
          fileName: image.file.name,
          contentType: image.file.type,
          sizeBytes: image.file.size,
          checksumSha256,
        },
      },
    );
    uploaded.set(image.id, authorization.mediaId);

    if (!authorization.alreadyUploaded) {
      let uploadResponse;
      try {
        uploadResponse = await fetch(authorization.uploadUrl, {
          method: "PUT",
          headers: authorization.requiredHeaders,
          body: image.file,
        });
      } catch {
        throw new Error(
          "Photo upload could not reach storage. Check MinIO and its browser CORS settings.",
        );
      }
      if (!uploadResponse.ok) {
        throw new Error(
          "Photo upload failed with storage status " +
            uploadResponse.status +
            ".",
        );
      }
      await api(
        "/listings/" +
          listingId +
          "/media/" +
          authorization.mediaId +
          "/complete",
        { method: "POST" },
      );
    }
  }

  const mediaIds = images.map(
    (image) => image.mediaId ?? uploaded.get(image.id),
  );
  if (mediaIds.some((id) => !id)) {
    throw new Error("One or more photos could not be matched to an upload.");
  }

  onProgress("Checking photos...");
  await waitUntilReady(listingId, mediaIds);

  onProgress("Saving photo order...");
  await api("/listings/" + listingId + "/media/order", {
    method: "PATCH",
    body: { mediaIds, coverMediaId: mediaIds[0] },
  });
  return mediaIds;
}

async function waitUntilReady(listingId, mediaIds) {
  const expected = new Set(mediaIds);
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const listing = await api(
      "/listings/" + listingId + "?site=" + SITE.toUpperCase(),
    );
    const selected = listing.media.filter((image) => expected.has(image.id));
    const rejected = selected.find((image) => image.status === "REJECTED");
    if (rejected) {
      throw new Error(
        rejected.rejectionReason ?? "A photo failed security validation.",
      );
    }
    if (
      selected.length === expected.size &&
      selected.every((image) => image.status === "READY")
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    "Photo processing took too long. Please try publishing again.",
  );
}
