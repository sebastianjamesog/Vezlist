"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  Eye,
  ImageIcon,
  LoaderCircle,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useNavigate } from "../lib/nav";
import { useAccount } from "../context/AccountContext";
import {
  createLiveSession,
  endLiveSession,
  getBroadcastTicket,
  getLivePaymentDetails,
  getLiveSession,
  getMyLiveSession,
  listLivePlans,
  saveLivePaymentDetails,
} from "../lib/api/live";
import {
  broadcastMimeType,
  openBrowserBroadcast,
} from "../components/live/browserBroadcast";
import LiveChat from "../components/live/LiveChat";
import StoryComposer from "../components/create/StoryComposer";

const METHODS = [
  {
    method: "INTERAC",
    name: "Interac e-Transfer",
    label: "Interac ID / Email",
    symbol: "Interac",
    color: "bg-amber-400 text-black",
  },
  {
    method: "PAYPAL",
    name: "PayPal",
    label: "PayPal Email",
    symbol: "P",
    color: "bg-blue-700 text-white",
  },
  {
    method: "GPAY",
    name: "Google Pay (GPay)",
    label: "GPay Email / Phone",
    symbol: "G",
    color: "bg-white text-blue-600 border border-slate-200",
  },
];
const PRIMARY =
  "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#075bfa] to-[#079cf6] px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-100 disabled:cursor-not-allowed disabled:opacity-40";
const SECONDARY =
  "min-h-12 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-900 disabled:opacity-40";
const money = (plan) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: plan.currency || "CAD",
  }).format(plan.price);
function sessionClock(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (!Number.isFinite(seconds)) return "00:00";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function Notice({ children }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-[#355282]">
      {children}
    </div>
  );
}
function Benefit({ icon: Icon, title, children }) {
  return (
    <div className="flex gap-3 py-2">
      <Icon className="mt-1 size-6 shrink-0 text-blue-600" />
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {children}
        </p>
      </div>
    </div>
  );
}
function CameraPreview({ stream, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label="Your camera preview"
      className={className}
    />
  );
}

export default function GoLive() {
  const navigate = useNavigate();
  const { can, signedIn } = useAccount();
  const allowed = signedIn && can("live.host");
  const [step, setStep] = useState("intro");
  const [catalog, setCatalog] = useState(null);
  const [title, setTitle] = useState("");
  const [planId, setPlanId] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(
    METHODS.map(({ method }) => ({ method, details: "", enabled: false })),
  );
  const [revealed, setRevealed] = useState({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [stream, setStream] = useState(null);
  const [facing, setFacing] = useState("user");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [broadcastState, setBroadcastState] = useState("idle");
  const [now, setNow] = useState(null);
  const [viewers, setViewers] = useState(0);
  const [storyOpen, setStoryOpen] = useState(false);
  const streamRef = useRef(null);
  const broadcast = useRef(null);
  const mounted = useRef(true);
  const requestKey = useRef({ key: null, fingerprint: null });
  const busyRef = useRef(false);
  const selectedPlan = catalog?.items?.find(
    (plan) => plan.id === planId && plan.enabled,
  );
  const terminal =
    session &&
    (["ENDED", "FAILED"].includes(session.status) ||
      (session.endsAt && now !== null && Date.parse(session.endsAt) <= now));
  const canStart = Boolean(
    selectedPlan &&
    stream &&
    catalog?.streamingAvailable &&
    (Number(selectedPlan.price) === 0 || catalog.demoPurchaseAvailable),
  );

  const stopMedia = useCallback(() => {
    broadcast.current?.stop();
    broadcast.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (mounted.current) {
      setStream(null);
      setBroadcastState("idle");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopMedia();
    };
  }, [stopMedia]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const plans = await listLivePlans();
      if (!mounted.current) return;
      setCatalog(plans);
      if (allowed) {
        const [details, ownSession] = await Promise.all([
          getLivePaymentDetails(),
          getMyLiveSession(),
        ]);
        if (!mounted.current) return;
        setPaymentDetails(
          METHODS.map(
            ({ method }) =>
              details.items?.find((item) => item.method === method) || {
                method,
                details: "",
                enabled: false,
              },
          ),
        );
        if (
          ownSession.session &&
          !["ENDED", "FAILED"].includes(ownSession.session.status)
        ) {
          setSession(ownSession.session);
          setStep("active");
        }
      }
    } catch (err) {
      if (mounted.current)
        setError(err.message || "Could not load your live session options.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [allowed]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session?.id || terminal) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await getLiveSession(session.id);
        if (active) setSession(next);
      } catch (err) {
        if (active)
          setError(err.message || "Could not refresh your live session.");
      }
    };
    const timer = setInterval(refresh, 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", refresh);
    };
  }, [session?.id, terminal]);

  useEffect(() => {
    if (terminal) stopMedia();
  }, [terminal, stopMedia]);

  async function requestCamera(nextFacing = facing) {
    if (busyRef.current) return null;
    busyRef.current = true;
    setPending(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera and microphone access requires HTTPS and a supported browser.",
        );
      if (!broadcastMimeType())
        throw new Error(
          "This browser cannot broadcast video. Please use a current Chrome, Edge, Firefox, or Safari browser.",
        );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const next = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mounted.current) {
        next.getTracks().forEach((track) => track.stop());
        return null;
      }
      streamRef.current = next;
      setStream(next);
      setFacing(nextFacing);
      setMuted(false);
      setCameraOff(false);
      return next;
    } catch (err) {
      setStream(null);
      streamRef.current = null;
      setError(
        err.name === "NotAllowedError"
          ? "Allow camera and microphone access to broadcast. You can retry after changing your browser permissions."
          : err.message || "Could not open the camera and microphone.",
      );
      return null;
    } finally {
      busyRef.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function toggleMicrophone() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }
  function toggleCamera() {
    const next = !cameraOff;
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !next;
    });
    setCameraOff(next);
  }
  function changePayment(method, patch) {
    setPaymentDetails((items) =>
      items.map((item) =>
        item.method === method ? { ...item, ...patch } : item,
      ),
    );
  }
  async function saveDetails() {
    if (paymentDetails.some((item) => item.enabled && !item.details.trim())) {
      setError(
        "Enter the details for each enabled payment method, or turn that method off.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      const saved = await saveLivePaymentDetails(
        paymentDetails.map((item) => ({
          ...item,
          details: item.details.trim(),
        })),
      );
      setPaymentDetails(saved.items);
      setStep("review");
    } catch (err) {
      setError(err.message || "Could not save your payment details.");
    } finally {
      setPending(false);
    }
  }

  async function connectBroadcast(current, media) {
    broadcast.current?.stop();
    setBroadcastState("connecting");
    const authorization = await getBroadcastTicket(current.id);
    if (!mounted.current) return;
    broadcast.current = openBrowserBroadcast({
      stream: media,
      ...authorization,
      onState: (state) => {
        if (mounted.current) {
          if (state === "stopped") stopMedia();
          setBroadcastState(state);
        }
      },
      onError: (err) => {
        if (mounted.current) {
          setError(err.message);
          stopMedia();
          setBroadcastState("interrupted");
        }
      },
    });
  }
  async function start() {
    if (!canStart || pending || busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError("");
    const payload = {
      title: (title.trim() || "Live session").slice(0, 80),
      planId: selectedPlan.id,
      planVersion: selectedPlan.version,
      demoPurchase:
        Number(selectedPlan.price) > 0 &&
        catalog.demoPurchaseAvailable === true,
    };
    const fingerprint = JSON.stringify(payload);
    if (requestKey.current.fingerprint !== fingerprint)
      requestKey.current = { key: crypto.randomUUID(), fingerprint };
    try {
      const created = await createLiveSession(payload, requestKey.current.key);
      if (!mounted.current) return;
      setSession(created);
      setNow(Date.now());
      setStep("active");
      try {
        await connectBroadcast(created, streamRef.current);
      } catch (connectionError) {
        stopMedia();
        setBroadcastState("interrupted");
        throw new Error(
          connectionError.message ||
            "Could not connect your broadcast. Please reconnect.",
        );
      }
    } catch (err) {
      if (err.status === 409) {
        requestKey.current = { key: null, fingerprint: null };
        setPlanId(null);
        const fresh = await listLivePlans().catch(() => null);
        if (fresh) setCatalog(fresh);
        setStep("plan");
        setError(
          "Your plan or session changed. Review the current plans before continuing.",
        );
      } else
        setError(
          err.message || "Could not start your live session. Please try again.",
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function reconnect() {
    if (pending || !session || terminal) return;
    const media = await requestCamera();
    if (!media) return;
    setPending(true);
    setError("");
    try {
      await connectBroadcast(session, media);
    } catch (err) {
      setError(err.message || "Could not reconnect your broadcast.");
      stopMedia();
    } finally {
      setPending(false);
    }
  }
  async function end() {
    if (pending || !session) return;
    stopMedia();
    setPending(true);
    setError("");
    try {
      const ended = await endLiveSession(session.id);
      setSession(ended || { ...session, status: "ENDED" });
    } catch (err) {
      setError(
        err.message ||
          "Your camera has stopped. Could not confirm the session ended; please retry.",
      );
    } finally {
      setPending(false);
    }
  }
  function back() {
    setError("");
    const previous = {
      plan: "intro",
      details: "plan",
      review: "details",
      payment: "review",
    };
    if (previous[step]) setStep(previous[step]);
    else navigate("/live");
  }

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#e8f5ff,#f6faff_52%,#eef5fc)] px-3 py-3 text-[#10183d] sm:px-6 sm:py-7">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-[440px] flex-col overflow-hidden rounded-[26px] border border-white bg-white/95 shadow-[0_18px_65px_rgba(22,64,120,.11)] sm:min-h-[min(820px,calc(100dvh-3.5rem))]">
        <header className="flex min-h-14 items-center border-b border-blue-50 px-3">
          <button
            onClick={back}
            disabled={pending || (step === "active" && !terminal)}
            aria-label="Back"
            className="grid size-10 place-items-center rounded-xl hover:bg-blue-50 disabled:opacity-30"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-extrabold">
            {step === "payment"
              ? "Payment"
              : step === "active"
                ? terminal
                  ? "Session ended"
                  : session?.status === "LIVE"
                    ? "You're Live!"
                    : "Connecting your live session"
                : "Go Live"}
          </h1>
          <span className="size-10" />
        </header>
        <div className="flex-1 space-y-5 px-4 pb-6 pt-5 sm:px-5">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
              {loading === false && !catalog && (
                <button onClick={load} className="ml-2 underline">
                  Retry
                </button>
              )}
            </div>
          )}
          {!allowed ? (
            <Notice>
              <p className="font-bold">Creator accounts can go live</p>
              <p className="mt-2">
                {signedIn
                  ? "Use a creator account to start a live session."
                  : "Sign in to your creator account to continue."}
              </p>
              <button
                onClick={() =>
                  navigate(
                    signedIn ? "/profile" : "/login?next=%2Flive%2Fstart",
                  )
                }
                className={`${PRIMARY} mt-4 w-full`}
              >
                {signedIn ? "Go to profile" : "Sign in"}
              </button>
            </Notice>
          ) : loading ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"
            >
              <LoaderCircle className="size-5 animate-spin" />
              Loading live options...
            </p>
          ) : (
            <>
              {step === "intro" && (
                <>
                  <div className="grid h-40 place-items-center rounded-2xl bg-[radial-gradient(circle,#ff174f,#b48c90_55%,#706b70)]">
                    <span className="grid size-20 place-items-center rounded-full bg-rose-500 text-white shadow-[0_0_0_13px_#ff2f6340]">
                      <Radio className="size-12" />
                    </span>
                  </div>
                  <div className="text-center">
                    <h2 className="font-extrabold">
                      Go live and interact in real time
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose a plan and start your live session.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-blue-50 px-4 py-2">
                    <Benefit
                      icon={Users}
                      title="Receive viewer payments directly"
                    >
                      Share only the payment details you choose.
                    </Benefit>
                    <Benefit
                      icon={ShieldCheck}
                      title="You control your broadcast"
                    >
                      Camera and microphone controls stay within reach.
                    </Benefit>
                    <Benefit icon={Radio} title="Reach people in Live Now">
                      Viewers can watch for free and sign in to chat.
                    </Benefit>
                  </div>
                  <button
                    onClick={() => setStoryOpen(true)}
                    className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
                  >
                    <span className="grid size-12 place-items-center rounded-xl bg-rose-500 text-white">
                      <ImageIcon />
                    </span>
                    <span className="flex-1">
                      <strong className="block text-sm">Post Story</strong>
                      <span className="text-xs text-slate-500">
                        Share a temporary story
                      </span>
                    </span>
                    <ChevronRight className="size-5" />
                  </button>
                  <button
                    onClick={() => setStep("plan")}
                    className="flex min-h-20 w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
                  >
                    <span className="grid size-12 place-items-center rounded-xl bg-violet-600 text-white">
                      <Video />
                    </span>
                    <span className="flex-1">
                      <strong className="block text-sm">Go Live</strong>
                      <span className="text-xs text-slate-500">
                        Start a live session
                      </span>
                    </span>
                    <ChevronRight className="size-5" />
                  </button>
                  <button
                    onClick={() => navigate("/live")}
                    className="min-h-12 w-full rounded-xl bg-slate-100 text-sm font-bold"
                  >
                    Cancel
                  </button>
                </>
              )}
              {step === "plan" && (
                <>
                  <div>
                    <h2 className="text-xl font-extrabold">
                      Choose your live plan
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Select the duration for your live session.
                    </p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Live plan"
                    className="space-y-3"
                  >
                    {catalog?.items
                      ?.filter((plan) => plan.enabled)
                      .map((plan) => (
                        <label
                          key={plan.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${planId === plan.id ? "border-blue-500 bg-blue-50" : "border-slate-100 bg-white shadow-sm"}`}
                        >
                          <Clock3 className="size-6 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <strong className="block text-sm">
                              {plan.name || `${plan.durationMinutes} minutes`}
                              {plan.badge && (
                                <span className="ml-1 inline-block whitespace-nowrap rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                                  {plan.badge}
                                </span>
                              )}
                            </strong>
                            <span className="mt-1 block text-xs text-slate-500">
                              {plan.durationMinutes} minutes live
                            </span>
                          </span>
                          <strong className="text-sm">{money(plan)}</strong>
                          <input
                            type="radio"
                            name="live-plan"
                            checked={planId === plan.id}
                            onChange={() => setPlanId(plan.id)}
                            className="size-4 accent-blue-600"
                          />
                        </label>
                      ))}
                  </div>
                  {!catalog?.items?.some((plan) => plan.enabled) && (
                    <Notice>
                      No live plans are available right now. Please try again
                      later.
                    </Notice>
                  )}
                  <Notice>
                    <div className="flex gap-3">
                      <Crown className="size-8 shrink-0 text-amber-500" />
                      <p>
                        <strong>Viewer payments go directly to you</strong>
                        <span className="mt-1 block text-xs">
                          Choose the payment methods you want to share during
                          your session.
                        </span>
                      </p>
                    </div>
                  </Notice>
                  <div className="flex gap-3">
                    <button onClick={back} className={SECONDARY}>
                      Back
                    </button>
                    <button
                      disabled={!selectedPlan}
                      onClick={() => {
                        setError("");
                        setStep("details");
                      }}
                      className={PRIMARY}
                    >
                      Continue <ArrowRight className="size-4" />
                    </button>
                  </div>
                </>
              )}
              {step === "details" && (
                <>
                  <div>
                    <h2 className="text-xl font-extrabold">
                      Receive payments from viewers
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Your viewers pay you directly. Payment details are
                      optional.
                    </p>
                  </div>
                  {METHODS.map(({ method, name, label, symbol, color }) => {
                    const detail = paymentDetails.find(
                      (item) => item.method === method,
                    );
                    return (
                      <div
                        key={method}
                        className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid size-11 shrink-0 place-items-center rounded-lg font-extrabold ${method === "INTERAC" ? "text-[10px] italic" : "text-lg"} ${color}`}
                          >
                            {symbol}
                          </span>
                          <strong className="min-w-0 flex-1 text-sm">
                            {name}
                          </strong>
                          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label={`Show ${name} to viewers`}
                              checked={detail.enabled}
                              onChange={(event) =>
                                changePayment(method, {
                                  enabled: event.target.checked,
                                })
                              }
                              className="peer sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 ${detail.enabled ? "bg-blue-600" : "bg-slate-300"}`}
                            >
                              <span
                                className={`size-4 rounded-full bg-white shadow-sm transition-transform ${detail.enabled ? "translate-x-4" : "translate-x-0"}`}
                              />
                            </span>
                          </label>
                        </div>
                        <label className="mt-4 block rounded-xl border border-blue-100 px-3 py-2">
                          <span className="block text-xs font-medium">
                            {label}
                          </span>
                          <span className="flex items-center gap-2">
                            <input
                              aria-label={label}
                              type={revealed[method] ? "text" : "password"}
                              maxLength={200}
                              autoComplete="off"
                              value={detail.details}
                              onChange={(event) =>
                                changePayment(method, {
                                  details: event.target.value,
                                })
                              }
                              placeholder="Enter your payment details"
                              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setRevealed((previous) => ({
                                  ...previous,
                                  [method]: !previous[method],
                                }))
                              }
                              className="text-xs font-semibold text-blue-600"
                            >
                              {revealed[method] ? "Hide" : "Show"}
                            </button>
                          </span>
                        </label>
                      </div>
                    );
                  })}
                  <Notice>
                    Only enabled payment details will be shown to viewers during
                    your live session.
                  </Notice>
                  <div className="flex gap-3">
                    <button
                      onClick={back}
                      disabled={pending}
                      className={SECONDARY}
                    >
                      Back
                    </button>
                    <button
                      onClick={saveDetails}
                      disabled={pending}
                      className={PRIMARY}
                    >
                      {pending ? "Saving..." : "Continue"}
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </>
              )}
              {step === "review" && (
                <>
                  <div>
                    <h2 className="text-xl font-extrabold">
                      Review your live session
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Check your details and test your camera before going live.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-white p-4">
                    <Clock3 className="size-6" />
                    <div className="flex-1 text-sm">
                      <span className="block text-slate-500">
                        Live duration
                      </span>
                      <strong>{selectedPlan?.durationMinutes} minutes</strong>
                    </div>
                    <div className="text-right">
                      <strong>{selectedPlan && money(selectedPlan)}</strong>
                      <button
                        onClick={() => setStep("plan")}
                        className="block text-xs font-medium text-blue-600"
                      >
                        Change plan
                      </button>
                    </div>
                  </div>
                  <label className="block text-sm font-bold">
                    Session title
                    <input
                      aria-label="Session title"
                      value={title}
                      maxLength={80}
                      placeholder="Give your live session a title"
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal"
                    />
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
                      {stream ? (
                        <CameraPreview
                          stream={stream}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-white/70">
                          <Camera className="size-10" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => requestCamera()}
                      disabled={pending}
                      className={`${SECONDARY} mt-3 w-full`}
                    >
                      {pending
                        ? "Opening camera..."
                        : stream
                          ? "Retest camera & microphone"
                          : "Test camera & microphone"}
                    </button>
                    {stream && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-xs text-green-700">
                          <Check className="size-4" />
                          Camera and microphone ready
                        </span>
                        <button
                          onClick={() =>
                            requestCamera(
                              facing === "user" ? "environment" : "user",
                            )
                          }
                          disabled={pending}
                          aria-label="Switch camera"
                          className="p-2 text-blue-600"
                        >
                          <SwitchCamera className="size-5" />
                        </button>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      This preview stays on your device until you start
                      broadcasting.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <div className="flex justify-between gap-3 text-sm">
                      <strong>Payment methods shown to viewers</strong>
                      <button
                        onClick={() => setStep("details")}
                        className="text-blue-600"
                      >
                        Edit
                      </button>
                    </div>
                    {paymentDetails.filter((item) => item.enabled).length ? (
                      paymentDetails
                        .filter((item) => item.enabled)
                        .map((item) => (
                          <div key={item.method} className="mt-3 text-sm">
                            <strong>
                              {
                                METHODS.find(
                                  (method) => method.method === item.method,
                                )?.name
                              }
                            </strong>
                            <p className="break-all text-xs text-slate-500">
                              {item.details}
                            </p>
                          </div>
                        ))
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        No payment details will be shared.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={back}
                      disabled={pending}
                      className={SECONDARY}
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setStep("payment")}
                      disabled={!stream || pending}
                      className={PRIMARY}
                    >
                      Continue to Payment
                    </button>
                  </div>
                </>
              )}
              {step === "payment" && (
                <>
                  <h2 className="text-xl font-extrabold">
                    Confirm your live plan
                  </h2>
                  <div className="rounded-xl border border-blue-100 bg-white p-4">
                    <p className="font-bold">{selectedPlan?.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedPlan?.durationMinutes} minutes
                    </p>
                    <p className="mt-3 text-2xl font-extrabold text-blue-600">
                      {selectedPlan && money(selectedPlan)}{" "}
                      <span className="text-xs font-normal">
                        {selectedPlan?.currency}
                      </span>
                    </p>
                  </div>
                  {catalog?.demoPurchaseAvailable ? (
                    <Notice>
                      <strong className="block">
                        Demo purchase - no charge
                      </strong>
                      <p className="mt-2 text-xs">
                        Test the live plan without paying. Your camera starts
                        transmitting after you continue.
                      </p>
                    </Notice>
                  ) : Number(selectedPlan?.price) > 0 ? (
                    <Notice>
                      <strong>Payments coming soon</strong>
                      <p className="mt-2 text-xs">
                        Paid live sessions will be available when checkout
                        launches.
                      </p>
                    </Notice>
                  ) : (
                    <Notice>
                      This plan is free. Your camera starts transmitting after
                      you continue.
                    </Notice>
                  )}
                  {!catalog?.streamingAvailable && (
                    <div
                      role="status"
                      className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
                    >
                      {catalog?.unavailableReason ||
                        "Live streaming is not available yet. Please try again later."}
                    </div>
                  )}
                  <p className="text-xs leading-relaxed text-slate-500">
                    Viewers watch for free. The session ends automatically when
                    your selected time runs out.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={back}
                      disabled={pending}
                      className={SECONDARY}
                    >
                      Back
                    </button>
                    <button
                      onClick={start}
                      disabled={pending || !canStart}
                      className={PRIMARY}
                    >
                      {pending
                        ? "Starting..."
                        : catalog?.demoPurchaseAvailable &&
                            Number(selectedPlan?.price) > 0
                          ? "Demo purchase & go live"
                          : "Start live session"}
                    </button>
                  </div>
                </>
              )}
              {step === "active" && session && (
                <>
                  <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white">
                    <div className="aspect-[9/12]">
                      {stream && !terminal ? (
                        <CameraPreview
                          stream={stream}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-5 bg-[radial-gradient(circle,#7e374a,#10182a)] p-6 text-center">
                          <Radio className="size-16 text-rose-500" />
                          <h2 className="text-2xl font-extrabold">
                            {terminal
                              ? "Your session has ended"
                              : "Connect your camera to broadcast"}
                          </h2>
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-x-3 top-3 flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-extrabold ${session.status === "LIVE" && !terminal ? "bg-rose-600" : "bg-black/65"}`}
                      >
                        {terminal
                          ? "ENDED"
                          : session.status === "LIVE"
                            ? "LIVE"
                            : session.status === "RECONNECTING"
                              ? "RECONNECTING"
                              : "PREPARING"}
                      </span>
                      <span className="rounded-lg bg-black/60 px-2 py-1 text-xs tabular-nums">
                        {session.startedAt && now
                          ? sessionClock(now - Date.parse(session.startedAt))
                          : "00:00"}
                      </span>
                      <span className="ml-auto flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs">
                        <Eye className="size-4" />
                        {viewers}
                      </span>
                    </div>
                    {!terminal && (
                      <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-black/60 p-3 text-center text-sm">
                        {session.status === "LIVE"
                          ? "Your live session is active."
                          : "Waiting for the video provider to confirm the broadcast."}
                        {session.endsAt && now && (
                          <p className="mt-2 text-xs">
                            Session ends in{" "}
                            {sessionClock(Date.parse(session.endsAt) - now)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {!terminal && (
                    <>
                      {broadcastState === "transmitting" ? (
                        <div className="flex justify-center gap-4">
                          <button
                            onClick={toggleMicrophone}
                            aria-label={
                              muted ? "Unmute microphone" : "Mute microphone"
                            }
                            className={`${SECONDARY} flex items-center gap-2`}
                          >
                            {muted ? (
                              <MicOff className="size-5" />
                            ) : (
                              <Mic className="size-5" />
                            )}
                            {muted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            onClick={toggleCamera}
                            aria-label={
                              cameraOff ? "Turn camera on" : "Turn camera off"
                            }
                            className={`${SECONDARY} flex items-center gap-2`}
                          >
                            {cameraOff ? (
                              <VideoOff className="size-5" />
                            ) : (
                              <Video className="size-5" />
                            )}
                            {cameraOff ? "Camera on" : "Camera off"}
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={
                            pending ||
                            broadcastState === "connecting" ||
                            !catalog?.streamingAvailable
                          }
                          onClick={reconnect}
                          className={`${PRIMARY} w-full`}
                        >
                          {pending || broadcastState === "connecting"
                            ? "Connecting camera..."
                            : "Reconnect camera & microphone"}
                        </button>
                      )}
                      <button
                        onClick={end}
                        disabled={pending}
                        className="min-h-12 w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {pending ? "Ending..." : "End Live"}
                      </button>
                      <LiveChat
                        sessionId={session.id}
                        host
                        onViewerCount={setViewers}
                      />
                    </>
                  )}
                  {terminal && (
                    <>
                      <Notice>
                        Your camera and microphone are off. Live sessions have
                        no replay.
                      </Notice>
                      <button
                        onClick={() => navigate("/live", { replace: true })}
                        className={`${PRIMARY} w-full`}
                      >
                        Back to Live Now
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {storyOpen && (
        <div className="fixed inset-0 z-[1100]">
          <StoryComposer onClose={() => setStoryOpen(false)} />
        </div>
      )}
    </main>
  );
}
