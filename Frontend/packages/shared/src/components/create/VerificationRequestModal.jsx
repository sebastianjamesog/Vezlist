"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCcw, ShieldCheck, Upload } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { ApiError } from "../../lib/api/client.js";
import { currentVerification, uploadVerificationPhoto } from "../../lib/api/verification.js";

const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 6;

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * The backend's own constraints on the verification photo
 * (`VerificationUploadRequest`'s content-type pattern,
 * `VerificationService.authorizeUpload`'s size check) checked client-side so
 * a bad pick is refused with a message rather than sent and bounced.
 */
function validateVerificationPhoto(file) {
  if (!file) return "Choose a photo.";
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Use a JPEG, PNG or WEBP photo.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `That photo is too large — keep it under ${(MAX_PHOTO_BYTES / (1024 * 1024)).toFixed(0)}MB.`;
  }
  return null;
}

/**
 * Shown right after a poster publishes an ad with "Post as Verified"
 * checked. `initial` is the just-created `VerificationRequestResponse`
 * (`AWAITING_PHOTO`, `photoStatus: "NONE"`) — this owns every state from
 * there on: the code + photo prompt, the upload, the async photo-processing
 * poll, and the terminal states (pending staff review, approved, or a photo
 * rejection the seller can retry from).
 *
 * Closing at any point is safe — nothing here is undone by dismissing the
 * modal. The listing already published; the verification request keeps
 * whatever state it was in on the server, and the Verified badge shows up on
 * its own (discovery/search/ad-detail all read the listing's own column)
 * once staff approve it, whether or not this modal is still open then.
 */
export default function VerificationRequestModal({ open, listingId, initial, onClose }) {
  const [request, setRequest] = useState(initial ?? null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [polling, setPolling] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const inputRef = useRef(null);

  // Freshly opened for a new listing: start over from whatever the publish
  // flow just handed us, not whatever an earlier open left behind.
  useEffect(() => {
    if (!open) return;
    setRequest(initial ?? null);
    setFile(null);
    setFileError(null);
    setUploadError(null);
    setPolling(false);
    setPollExhausted(false);
  }, [open, initial]);

  async function pollForOutcome() {
    setPolling(true);
    setPollExhausted(false);
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const latest = await currentVerification(listingId);
        setRequest(latest);
        if (latest.photoStatus !== "PROCESSING") {
          setPolling(false);
          return;
        }
      } catch {
        // A transient poll failure isn't worth surfacing — just try again
        // next tick, up to the same attempt cap.
      }
    }
    setPolling(false);
    setPollExhausted(true);
  }

  function pickFile(e) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setFileError(picked ? validateVerificationPhoto(picked) : null);
    setUploadError(null);
  }

  async function submitPhoto() {
    const problem = validateVerificationPhoto(file);
    if (problem) return setFileError(problem);
    setUploading(true);
    setUploadError(null);
    try {
      const afterComplete = await uploadVerificationPhoto(listingId, request.id, file, file.name);
      setRequest(afterComplete);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (afterComplete.photoStatus === "PROCESSING") pollForOutcome();
    } catch (error) {
      setUploadError(
        error instanceof ApiError ? error.message : "Couldn't upload that photo — try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  if (!open || !request) return null;

  const awaitingPhoto = request.status === "AWAITING_PHOTO";
  const photoRejected = awaitingPhoto && request.photoStatus === "REJECTED";
  const processing =
    polling || request.photoStatus === "PROCESSING" || request.photoStatus === "UPLOADING";

  let body;
  if (request.status === "APPROVED") {
    body = (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <ShieldCheck className="size-12 text-emerald-600" />
        <p className="text-[16px] font-bold text-ink">Verified</p>
        <p className="text-[14px] text-muted">
          Your ad now shows the Verified badge everywhere it appears.
        </p>
      </div>
    );
  } else if (request.status === "REJECTED") {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-ink">
          Staff reviewed your submission and didn&apos;t approve it.
        </p>
        {request.rejectionReason && (
          <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-danger">
            {request.rejectionReason}
          </p>
        )}
      </div>
    );
  } else if (request.status === "PENDING_REVIEW") {
    body = (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Clock className="size-12 text-brand" />
        <p className="text-[16px] font-bold text-ink">Pending staff review</p>
        <p className="text-[14px] text-muted">
          Your photo was accepted. A staff member will confirm the code and
          approve it — you can close this and keep browsing; the Verified
          badge appears on its own once it&apos;s approved.
        </p>
      </div>
    );
  } else if (processing) {
    body = (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div
          aria-hidden="true"
          className="size-12 animate-spin rounded-full border-4 border-line border-t-brand"
        />
        <p className="text-[16px] font-bold text-ink">Checking your photo…</p>
        <p className="text-[14px] text-muted">
          {pollExhausted
            ? "Still working on it — you can close this and check back, or try again now."
            : "This usually takes a few seconds."}
        </p>
        {pollExhausted && (
          <Button variant="outline" size="sm" onClick={pollForOutcome}>
            <RefreshCcw className="size-4" />
            Check again
          </Button>
        )}
      </div>
    );
  } else {
    // AWAITING_PHOTO, photoStatus NONE or REJECTED: the code + upload form.
    body = (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-canvas p-5 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
            Your verification code
          </p>
          <p className="mt-1 text-[40px] font-extrabold tabular-nums tracking-[0.2em] text-ink">
            {request.code}
          </p>
        </div>
        <p className="text-[14px] leading-relaxed text-muted">
          Write this code on a piece of paper, take a photo of yourself
          holding it clearly, and upload it below. Staff will check the code
          against your listing before approving it.
        </p>

        {photoRejected && (
          <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13.5px] font-medium text-danger">
            Your last photo wasn&apos;t accepted
            {request.photoRejectionReason ? `: ${request.photoRejectionReason}` : "."} Try again
            with a clearer photo.
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-[14px] font-bold text-ink">Photo</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={pickFile}
            disabled={uploading}
            className="block w-full text-[14px] text-ink file:mr-3 file:rounded-xl file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:text-[13px] file:font-bold file:text-brand"
          />
        </label>
        {fileError && (
          <p role="alert" className="text-[13px] font-medium text-red-600">
            {fileError}
          </p>
        )}
        {uploadError && (
          <p role="alert" className="text-[13px] font-medium text-red-600">
            {uploadError}
          </p>
        )}

        <Button
          onClick={submitPhoto}
          disabled={!file || Boolean(fileError) || uploading}
          className="w-full"
        >
          <Upload className="size-4" />
          {uploading ? "Uploading…" : "Upload photo"}
        </Button>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Verify this ad"
      subtitle={awaitingPhoto ? "One more step" : undefined}
    >
      {body}
    </Modal>
  );
}
