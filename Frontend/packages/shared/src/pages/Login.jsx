"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNavigate, useSearchParams } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import { validateAuth } from "../lib/auth";

const EMPTY = { name: "", email: "", password: "", accepted: false };

const PITCH = [
  {
    Icon: Zap,
    title: "Post in under a minute",
    body: "Four steps, photos first.",
  },
  {
    Icon: ShieldCheck,
    title: "Verified sellers",
    body: "Badged ads are ID-checked.",
  },
  {
    Icon: Sparkles,
    title: "Ads and status in one",
    body: "Post an ad, share an update.",
  },
];

/** Standalone screen: no shell, no nav — the only way in or out is the form. */
export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signIn, signedIn, ready } = useAuth();
  // Where the gate sent us from, if it did.
  const next = params.get("next") || "/";
  const [mode, setMode] = useState("signin");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [shown, setShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const signup = mode === "signup";

  const patch = (next) => {
    setValues((v) => ({ ...v, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  };

  // Already signed in and asking for the form: there is nothing to do here.
  useEffect(() => {
    if (ready && signedIn) navigate(next, { replace: true });
  }, [ready, signedIn, navigate, next]);

  async function submit(e) {
    e.preventDefault();
    const found = validateAuth(values, mode);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSubmitting(true);
    try {
      await signIn(values, mode);
      navigate(next, { replace: true });
    } catch (error) {
      const mapped = Object.fromEntries(
        (error.details ?? []).map(({ field, message }) => [
          field === "acceptedTerms" ? "accepted" : field,
          message,
        ]),
      );
      setErrors(
        Object.keys(mapped).length
          ? mapped
          : { form: error.message ?? "Could not sign in. Please try again." },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh justify-center bg-canvas lg:justify-start">
      {/* Desktop gets a brand panel; the phone gets a gradient cap instead. */}
      <aside className="brand-gradient relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden p-12 text-on-brand lg:flex">
        <span
          aria-hidden="true"
          className="absolute -right-24 -top-24 size-96 rounded-full bg-on-brand/15 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-32 -left-20 size-96 rounded-full bg-on-brand/10 blur-3xl"
        />

        <p className="relative text-[26px] font-extrabold tracking-tight">
          Vezlist
        </p>

        <div className="relative">
          <h1 className="max-w-md text-[44px] font-extrabold leading-[1.05] tracking-tight">
            Everything nearby, in one feed.
          </h1>
          <ul className="mt-10 space-y-5">
            {PITCH.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-on-brand/15 backdrop-blur-sm">
                  <Icon className="size-5" strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-[16px] font-bold">{title}</span>
                  <span className="block text-[14px] text-on-brand/75">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px] text-on-brand/70">
          © Vezlist. Post, promote, grow.
        </p>
      </aside>

      <main className="flex w-full max-w-[430px] flex-col bg-surface lg:max-w-none lg:flex-1 lg:items-center lg:justify-center lg:bg-canvas">
        {/* Mobile hero */}
        <div className="brand-gradient relative overflow-hidden px-6 pb-16 pt-14 text-on-brand lg:hidden">
          <span
            aria-hidden="true"
            className="absolute -right-16 -top-16 size-64 rounded-full bg-on-brand/15 blur-3xl"
          />
          <p className="relative text-[22px] font-extrabold tracking-tight">
            Vezlist
          </p>
          <h1 className="relative mt-4 text-[30px] font-extrabold leading-tight">
            {signup ? "Create your account." : "Welcome back."}
          </h1>
          <p className="relative mt-2 max-w-[15rem] text-[14px] leading-relaxed text-on-brand/80">
            {signup
              ? "One account for your ads, saved items and status."
              : "Sign in to manage your ads and saved items."}
          </p>
        </div>

        <div className="relative -mt-8 flex-1 rounded-t-sheet bg-surface px-5 pb-8 pt-6 lg:mt-0 lg:w-full lg:max-w-md lg:flex-none lg:rounded-card lg:p-8 lg:shadow-lift">
          <div className="mb-6 flex gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
            {[
              ["signin", "Sign in"],
              ["signup", "Create account"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setErrors({});
                }}
                className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all ${
                  mode === value
                    ? "bg-surface text-ink shadow-card"
                    : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            {errors.form && (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">
                {errors.form}
              </p>
            )}
            {signup && (
              <Field label="Full name" error={errors.name}>
                <input
                  value={values.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  autoComplete="name"
                  className={`${FIELD} ${border(errors.name)}`}
                />
              </Field>
            )}

            <Field label="Email" error={errors.email}>
              <input
                type="email"
                value={values.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="you@example.com"
                autoComplete="email"
                className={`${FIELD} ${border(errors.email)}`}
              />
            </Field>

            <Field
              label="Password"
              hint={
                signup ? undefined : (
                  <Link
                    href="/support"
                    className="font-semibold text-brand hover:underline"
                  >
                    Forgot?
                  </Link>
                )
              }
              error={errors.password}
            >
              <span className="relative block">
                <input
                  type={shown ? "text" : "password"}
                  value={values.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  autoComplete={signup ? "new-password" : "current-password"}
                  aria-label="Password"
                  className={`${FIELD} ${border(errors.password)} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShown((s) => !s)}
                  aria-label={shown ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  {shown ? (
                    <EyeOff className="size-[18px]" />
                  ) : (
                    <Eye className="size-[18px]" />
                  )}
                </button>
              </span>
            </Field>

            {signup && (
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={values.accepted}
                  onChange={(e) => patch({ accepted: e.target.checked })}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                />
                <span className="text-[13px] leading-relaxed text-muted">
                  I agree to the terms of service and privacy policy.
                  {errors.accepted && (
                    <span
                      role="alert"
                      className="mt-1 block font-semibold text-red-600"
                    >
                      {errors.accepted}
                    </span>
                  )}
                </span>
              </label>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : signup ? "Create account" : "Sign in"}
              <ArrowRight className="size-5" strokeWidth={2.5} />
            </Button>
          </form>

          <p className="mt-6 text-center text-[13px] text-muted">
            <Link href="/" className="font-semibold text-brand hover:underline">
              Skip for now
            </Link>{" "}
            and browse as a guest.
          </p>
        </div>
      </main>
    </div>
  );
}
