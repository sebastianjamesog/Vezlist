"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Video,
  X,
} from "lucide-react";
import { useDialogFocus } from "../../lib/useDialogFocus";
import { useToast } from "../../context/ToastContext";
import { useStatus } from "../../context/StatusContext";
import { useAccount } from "../../context/AccountContext";
import { useNavigate } from "../../lib/nav";
import { downscaleToDataUri } from "../../lib/media";
import { dataUriToBlob } from "../../lib/api/media";
import {
  deleteStory,
  listMyStories,
  listStoryPlans,
  publishStory,
  uploadStory,
} from "../../lib/api/stories";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(",");
const primary =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2858e8] px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";
const secondary =
  "min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#101831] disabled:opacity-50";
const money = (plan) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: plan.currency || "CAD",
    maximumFractionDigits: 2,
  }).format(plan.price);

function videoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (error) => {
      clearTimeout(timer);
      const duration = video.duration;
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error || !Number.isFinite(duration))
        reject(
          new Error(
            "Could not read this video. Please choose an MP4 or WebM video.",
          ),
        );
      else resolve(duration);
    };
    const timer = setTimeout(() => finish(true), 15000);
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(false);
    video.onerror = () => finish(true);
    video.src = url;
  });
}

function MediaPreview({ src, type, className = "" }) {
  if (type === "VIDEO")
    return (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className={className}
      />
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Story preview" className={className} />;
}

export default function StoryComposer({ onClose }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshStories } = useStatus();
  const { signedIn, can } = useAccount();
  const allowed = signedIn && can("status.post");
  const [step, setStep] = useState("media");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [draft, setDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [demoPurchaseAvailable, setDemoPurchaseAvailable] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [credits, setCredits] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [method, setMethod] = useState("card");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const gallery = useRef(null);
  const camera = useRef(null);
  const recorder = useRef(null);
  const alive = useRef(true);
  const close = () => {
    if (!busy) onClose();
  };
  const ref = useDialogFocus(true, close);
  const selectedPlan = plans.find((plan) => plan.id === selectedId);
  const isDemoPurchase =
    demoPurchaseAvailable && !useCredit && Number(selectedPlan?.price) > 0;
  const canPublish = useCredit
    ? credits > 0
    : selectedPlan && (Number(selectedPlan.price) === 0 || isDemoPurchase);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([listStoryPlans(), listMyStories()])
      .then(([catalog, own]) => {
        if (!active) return;
        setPlans((catalog.items || []).filter((plan) => plan.enabled));
        setDemoPurchaseAvailable(catalog.demoPurchaseAvailable === true);
        setDrafts(
          (own.items || []).filter((story) =>
            ["READY", "UPLOADING"].includes(story.status),
          ),
        );
        setCredits(own.credits || 0);
        setUseCredit((own.credits || 0) > 0);
      })
      .catch((err) => {
        if (active) {
          setLoadFailed(true);
          setError(
            err.message || "Could not load your story plans. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed, loadAttempt]);

  function retryLoad() {
    setError("");
    setLoadFailed(false);
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function pick(event) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked || busy) return;
    setError("");
    const isVideo = VIDEO_TYPES.includes(picked.type);
    if (!isVideo && !IMAGE_TYPES.includes(picked.type)) {
      setError("Choose a JPEG, PNG, WebP, MP4, or WebM file.");
      return;
    }
    if (!picked.size || picked.size > (isVideo ? 50 : 10) * 1024 * 1024) {
      setError(
        isVideo
          ? "Videos must be between 1 byte and 50 MB."
          : "Photos must be between 1 byte and 10 MB.",
      );
      return;
    }
    setBusy(true);
    try {
      let prepared = picked;
      if (isVideo) {
        if ((await videoDuration(picked)) > 60)
          throw new Error("Choose a video that is 60 seconds or shorter.");
      } else {
        const blob = dataUriToBlob(await downscaleToDataUri(picked));
        prepared = new File(
          [blob],
          `${picked.name.replace(/\.[^.]+$/, "")}.jpg`,
          { type: "image/jpeg" },
        );
      }
      if (alive.current) {
        setDraft(null);
        setFile(prepared);
      }
    } catch (err) {
      if (alive.current) setError(err.message || "Could not read this media.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function next() {
    if (busy || loadFailed || loading || (!file && draft?.status !== "READY"))
      return;
    setBusy(true);
    setError("");
    try {
      const saved = draft || (await uploadStory(file));
      setDraft(saved);
      setDrafts((items) => [
        saved,
        ...items.filter((item) => item.id !== saved.id),
      ]);
      setFile(null);
      setStep("payment");
    } catch (err) {
      setError(err.message || "Could not save your story. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft(item) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteStory(item.id);
      setDrafts((items) => items.filter((entry) => entry.id !== item.id));
      if (draft?.id === item.id) setDraft(null);
    } catch (err) {
      setError(err.message || "Could not remove this draft.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (busy || !draft || !canPublish) return;
    setBusy(true);
    setError("");
    try {
      await publishStory(
        draft.id,
        useCredit
          ? { useCredit: true }
          : {
              planId: selectedPlan.id,
              planVersion: selectedPlan.version,
              useCredit: false,
              ...(isDemoPurchase ? { demoPurchase: true } : {}),
            },
      );
      setDrafts((items) => items.filter((item) => item.id !== draft.id));
      setStep("success");
      await refreshStories().catch(() => {});
    } catch (err) {
      if (err.status === 409) {
        setSelectedId(null);
        const catalog = await listStoryPlans().catch(() => null);
        setDemoPurchaseAvailable(catalog?.demoPurchaseAvailable === true);
        if (catalog)
          setPlans((catalog.items || []).filter((plan) => plan.enabled));
        const own = await listMyStories().catch(() => null);
        if (own) {
          setCredits(own.credits || 0);
          setUseCredit(false);
        }
        setError(
          "Your plan or story credits changed. Please review the options and select again.",
        );
      } else
        setError(
          err.message ||
            "Your story could not be published. Your draft is saved.",
        );
    } finally {
      setBusy(false);
    }
  }

  async function postAnother() {
    setDraft(null);
    setFile(null);
    setSelectedId(null);
    setStep("media");
    const own = await listMyStories().catch(() => null);
    if (own) {
      setCredits(own.credits || 0);
      setUseCredit((own.credits || 0) > 0);
    }
  }

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-[1010] bg-[#f8fbff] lg:fixed lg:grid lg:place-items-center lg:bg-slate-950/60 lg:p-5"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-composer-title"
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-gradient-to-b from-white to-[#f4f9ff] text-[#101831] outline-none lg:max-h-[820px] lg:max-w-[440px] lg:overflow-hidden lg:rounded-3xl lg:shadow-2xl"
      >
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-blue-50 px-4 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            disabled={busy}
            onClick={
              step === "payment"
                ? () => {
                    setStep("media");
                    setError("");
                  }
                : close
            }
            aria-label={
              step === "payment" ? "Back to media" : "Close story composer"
            }
            className="grid size-10 place-items-center rounded-full hover:bg-blue-50 disabled:opacity-50"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 id="story-composer-title" className="text-lg font-extrabold">
            {step === "success" ? "Story published" : "Post Story"}
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          {!allowed ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <h2 className="font-bold">Ad creators can post stories</h2>
              <p className="mt-2 text-sm text-slate-600">
                {signedIn
                  ? "Use an ad creator account to share your story."
                  : "Sign in to your ad creator account to continue."}
              </p>
              <button onClick={close} className={`${primary} mt-5`}>
                Close
              </button>
            </div>
          ) : (
            <>
              {step !== "success" && (
                <ol
                  aria-label="Story progress"
                  className="mb-7 flex items-start justify-between"
                >
                  {["Add media", "Payment", "Published"].map((label, index) => (
                    <li
                      key={label}
                      aria-current={
                        (step === "media" ? 0 : 1) === index
                          ? "step"
                          : undefined
                      }
                      className="relative flex flex-1 flex-col items-center gap-2 text-[11px] font-semibold text-slate-500"
                    >
                      {index < 2 && (
                        <span className="absolute left-1/2 right-[-50%] top-3 h-px bg-blue-100" />
                      )}
                      <span
                        className={`relative grid size-6 place-items-center rounded-full ${(step === "media" ? 0 : 1) >= index ? "bg-[#2858e8] text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        {index + 1}
                      </span>
                      <span>{label}</span>
                    </li>
                  ))}
                </ol>
              )}
              {error && (
                <p
                  role="alert"
                  className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                  {loadFailed && (
                    <button
                      type="button"
                      onClick={retryLoad}
                      className="ml-2 font-bold underline focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      Try again
                    </button>
                  )}
                </p>
              )}
              {loading ? (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading story plans...
                </p>
              ) : loadFailed ? null : step === "media" ? (
                <>
                  <input
                    ref={gallery}
                    aria-label="Add media from gallery"
                    type="file"
                    accept={ACCEPT}
                    onChange={pick}
                    className="hidden"
                  />
                  <input
                    ref={camera}
                    aria-label="Take photo"
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    capture="environment"
                    onChange={pick}
                    className="hidden"
                  />
                  <input
                    ref={recorder}
                    aria-label="Record video"
                    type="file"
                    accept={VIDEO_TYPES.join(",")}
                    capture="environment"
                    onChange={pick}
                    className="hidden"
                  />
                  <div className="flex items-start gap-3">
                    <div className="relative aspect-[9/16] w-[43%] shrink-0 overflow-hidden rounded-xl border-2 border-blue-400 bg-blue-50 p-0.5">
                      {preview || draft?.mediaUrl ? (
                        <>
                          <MediaPreview
                            src={preview || draft.mediaUrl}
                            type={
                              file
                                ? file.type.startsWith("video/")
                                  ? "VIDEO"
                                  : "IMAGE"
                                : draft.mediaType
                            }
                            className="size-full rounded-lg bg-slate-900 object-contain"
                          />
                          <button
                            disabled={busy}
                            onClick={() => {
                              setFile(null);
                              setDraft(null);
                            }}
                            aria-label="Remove selected media"
                            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-white text-slate-900 shadow"
                          >
                            <X className="size-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-blue-400">
                          <ImageIcon className="size-8" />
                          <span className="text-xs">Your story preview</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-3">
                      {[
                        {
                          label: "Add from Gallery",
                          icon: ImageIcon,
                          input: gallery,
                        },
                        { label: "Take Photo", icon: Camera, input: camera },
                        { label: "Record Video", icon: Video, input: recorder },
                      ].map(({ label, icon: Icon, input }) => (
                        <button
                          key={label}
                          disabled={busy}
                          onClick={() => input.current?.click()}
                          className="flex min-h-[62px] items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-4 text-left text-xs font-semibold shadow-sm hover:border-blue-300 disabled:opacity-50"
                        >
                          <Icon className="size-5 shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-5 mt-4 flex gap-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
                    <ImageIcon className="mt-0.5 size-5 shrink-0" />
                    <p>
                      <strong>Add Photo / Video</strong>
                      <span className="mt-1 block text-xs text-slate-600">
                        Vertical 9:16 recommended. Photos up to 10 MB; videos up
                        to 50 MB and 60 seconds.
                      </span>
                    </p>
                  </div>
                  <p className="mb-5 text-xs leading-relaxed text-slate-500">
                    Visible to everyone for 24 hours after publishing. One photo
                    or video per story.
                  </p>
                  <button
                    disabled={busy || (!file && !draft)}
                    onClick={next}
                    className={primary}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Preparing your story...
                      </>
                    ) : (
                      "Next"
                    )}
                  </button>
                  {drafts.length > 0 && (
                    <div className="mt-7">
                      <h2 className="mb-3 text-sm font-bold">Saved drafts</h2>
                      <div className="space-y-2">
                        {drafts.map((item, index) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2"
                          >
                            <button
                              disabled={busy || item.status !== "READY"}
                              onClick={() => {
                                setDraft(item);
                                setFile(null);
                                setError("");
                              }}
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                              {item.mediaUrl ? (
                                <MediaPreview
                                  src={item.mediaUrl}
                                  type={item.mediaType}
                                  className="h-14 w-10 rounded-md bg-slate-100 object-cover"
                                />
                              ) : (
                                <span className="grid h-14 w-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-400">
                                  <ImageIcon
                                    className="size-5"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                              <span className="min-w-0 break-words text-sm font-medium">
                                {item.mediaType === "VIDEO" ? "Video" : "Photo"}{" "}
                                {item.status === "READY"
                                  ? "draft"
                                  : "incomplete upload"}{" "}
                                {index + 1}
                                <span className="block text-xs font-normal text-slate-500">
                                  {item.status === "READY"
                                    ? "Continue to plans"
                                    : "Delete this upload and select the file again."}
                                </span>
                              </span>
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => removeDraft(item)}
                              aria-label={`Delete draft ${index + 1}`}
                              className="grid size-10 shrink-0 place-items-center text-slate-500"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : step === "payment" ? (
                <>
                  <h2 className="mb-3 text-lg font-extrabold">Choose a plan</h2>
                  <div
                    role="radiogroup"
                    aria-label="Story plan"
                    className="space-y-3"
                  >
                    {credits > 0 && (
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${useCredit ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        <input
                          type="radio"
                          name="story-plan"
                          checked={useCredit}
                          onChange={() => {
                            setUseCredit(true);
                            setSelectedId(null);
                          }}
                          disabled={busy}
                          className="size-4 accent-blue-600"
                        />
                        <span className="text-sm font-bold">
                          Use a story credit
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            {credits} remaining · publishes for 24 hours
                          </span>
                        </span>
                      </label>
                    )}
                    {plans.map((plan) => (
                      <label
                        key={plan.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${!useCredit && selectedId === plan.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
                      >
                        <input
                          type="radio"
                          name="story-plan"
                          checked={!useCredit && selectedId === plan.id}
                          onChange={() => {
                            setUseCredit(false);
                            setSelectedId(plan.id);
                          }}
                          disabled={busy}
                          className="size-4 shrink-0 accent-blue-600"
                        />
                        <span className="min-w-0 flex-1 break-words text-sm font-bold">
                          {plan.name}
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            {plan.storyCount}{" "}
                            {plan.storyCount === 1 ? "story" : "stories"} · each
                            visible for 24 hours
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-extrabold">
                          {money(plan)}
                          <span className="block text-right text-[10px] font-normal text-slate-500">
                            {plan.currency}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!plans.length && !credits && (
                    <p className="rounded-xl bg-blue-50 p-4 text-sm text-slate-600">
                      No story packs are available right now. You can save your
                      draft and return later.
                    </p>
                  )}
                  {selectedPlan?.storyCount > 1 && !useCredit && (
                    <p className="mt-3 text-xs text-slate-500">
                      One story is published now. The remaining credits can be
                      used for future stories.
                    </p>
                  )}
                  {demoPurchaseAvailable && !useCredit && (
                    <p className="mb-5 mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-slate-600">
                      <strong className="block text-blue-700">
                        Demo purchase — no charge
                      </strong>
                      Choose a pack to test publishing. No payment details are
                      needed and no money is collected.
                    </p>
                  )}
                  {!canPublish && !demoPurchaseAvailable && (
                    <>
                      <h2 className="mb-3 mt-6 text-lg font-extrabold">
                        Payment method
                      </h2>
                      <div
                        role="radiogroup"
                        aria-label="Payment method"
                        className="overflow-hidden rounded-xl border border-slate-100 bg-white"
                      >
                        {[
                          {
                            id: "ltc",
                            label: "Crypto (Litecoin - LTC)",
                            icon: Banknote,
                          },
                          {
                            id: "card",
                            label: "Credit / Debit Card",
                            icon: CreditCard,
                          },
                          { id: "cash", label: "Cash (ATM)", icon: Banknote },
                        ].map(({ id, label, icon: Icon }) => (
                          <label
                            key={id}
                            className="flex cursor-pointer items-center gap-3 border-b border-slate-100 p-4 last:border-0"
                          >
                            <Icon className="size-5 text-slate-600" />
                            <span className="flex-1 text-sm">{label}</span>
                            <input
                              type="radio"
                              name="story-payment"
                              checked={method === id}
                              onChange={() => setMethod(id)}
                              className="size-4 accent-blue-600"
                            />
                            <ChevronRight className="size-4 text-slate-400" />
                          </label>
                        ))}
                      </div>
                      <p className="mb-5 mt-4 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-slate-600">
                        <strong className="block text-blue-700">
                          Payments coming soon
                        </strong>
                        Your draft is saved. Paid packs will be available when
                        payments launch.
                      </p>
                    </>
                  )}
                  <div className="mt-6 space-y-3">
                    <button
                      disabled={busy || !canPublish}
                      onClick={publish}
                      className={primary}
                    >
                      {busy ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          Publishing...
                        </>
                      ) : canPublish ? (
                        isDemoPurchase ? (
                          "Demo purchase & publish"
                        ) : (
                          "Publish story"
                        )
                      ) : (
                        <>
                          <LockKeyhole className="size-4" />
                          {selectedPlan
                            ? `Pay ${money(selectedPlan)}`
                            : "Choose a plan"}
                        </>
                      )}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        toast(
                          "Your story draft is saved. You can continue it later.",
                        );
                        onClose();
                      }}
                      className={`${secondary} w-full`}
                    >
                      Save draft & close
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[430px] flex-col items-center text-center">
                  <div className="relative mb-7 mt-10 grid size-28 place-items-center rounded-full bg-gradient-to-br from-green-400 to-green-700 shadow-lg shadow-green-200">
                    <Check className="size-16 text-white" strokeWidth={3} />
                    <span className="absolute -left-5 top-3 size-2 rotate-45 bg-yellow-400" />
                    <span className="absolute -right-5 bottom-4 size-2 rotate-12 bg-blue-500" />
                    <span className="absolute -right-1 -top-5 size-2 rotate-45 bg-pink-400" />
                  </div>
                  <h2 className="text-2xl font-extrabold">
                    Your story is live!
                  </h2>
                  <p className="mt-3 text-sm text-slate-500">
                    It will be visible to everyone for 24 hours.
                  </p>
                  <div className="mt-auto w-full space-y-3 pt-12">
                    <button
                      onClick={() => {
                        onClose();
                        navigate("/status/me");
                      }}
                      className={primary}
                    >
                      View My Stories
                    </button>
                    <button
                      onClick={postAnother}
                      className="min-h-12 w-full rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700"
                    >
                      Post Another Story
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
