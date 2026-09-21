"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNavigate, useSearchParams } from "../lib/nav";
import { safeNext } from "../lib/redirect";
import { useAuth } from "../context/AuthContext";
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import Button from "../components/ui/Button";
import SegmentedControl from "../components/ui/SegmentedControl";
import Wordmark from "../components/layout/Wordmark";
import Icon from "../components/ui/Icon";
import Field, { FIELD, border } from "../components/create/Field";
import { ACCOUNT_ROLES, SIGNUP_ROLE } from "../lib/accountRoles";
import { demoAccounts } from "../data/mock";
import { validateAuth } from "../lib/auth";
import { ApiError } from "../lib/api/client";

const EMPTY = { name: "", email: "", password: "", accepted: false };

const MODES = [
  { value: "signin", label: "Sign in" },
  { value: "signup", label: "Create account" },
];

/**
 * Standalone screen: no shell, no nav — the only way in or out is the form.
 *
 * One centred column at every width. The split brand panel it used to wear on
 * desktop gave the form half a screen and the pitch the other half, which put
 * the thing people came here to do off to one side; the pitch is now three
 * lines under the card, where it costs nothing and interrupts nobody.
 *
 * There is no "continue with Google" row. There was — Google and Apple, side
 * by side above the form — and both buttons did the same thing: navigate to
 * `next` without signing anybody in. A provider button that only pretends is
 * the one lie a front door cannot afford, and real OAuth needs a backend this
 * build does not have. With them went the "or with email" rule, which existed
 * to separate them from the form and now had nothing on its other side; the
 * segmented control is the card's first element, and the card's own padding is
 * the space the rule used to occupy.
 *
 * The card floats on a lit canvas — two soft brand washes behind frosted glass
 * — so the screen reads as this product's front door and not as a form on a
 * white page. Both sites render it: every colour is a token, and the wordmark
 * names whichever site is asking.
 */
export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signIn, signedIn, ready } = useAuth();
  // Where the gate sent us from, if it did — same-origin only, so a crafted
  // link can't turn this form into an offsite redirect.
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState("signin");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [shown, setShown] = useState(false);
  const [pending, setPending] = useState(false);
  const signup = mode === "signup";

  function messageFor(error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return "That email or password isn't right.";
      if (error.status === 409) return "An account with that email already exists.";
      return error.details?.[0]?.message ?? error.message;
    }
    return "Something went wrong. Check your connection and try again.";
  }

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

  /**
   * Sign in as one of the demo accounts.
   *
   * It skips `validateAuth` deliberately: the credentials are ours and already
   * valid, and putting them through the form validator would only invent a way
   * for a typo in mock data to render an error on a button the reader has no
   * way to fix.
   *
   * No name is passed. In sign-in mode `signIn` takes the mock profile's name
   * rather than anything handed to it — there is no server to ask who this
   * email belongs to — so passing "Ads creator" as a person's name would be
   * ignored at best and displayed at worst. Both demos are Sarah, which is
   * whose ads, saved items and tickets the rest of the app is full of.
   *
   * The role, though, is passed explicitly, and that is the point of these two
   * buttons: signup always makes a creator now, so this is the only way to see
   * the browsing view without switching down in Settings first.
   */
  async function signInAs(account) {
    setPending(true);
    try {
      await signIn(
        { email: account.email, password: account.password, role: account.role },
        "signin",
      );
      navigate(next, { replace: true });
    } catch (error) {
      setErrors({ password: messageFor(error) });
    } finally {
      setPending(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    // Signing up makes an ads creator, and does not ask: nobody needs an
    // account to browse, so the only reason to make one is to post. Signing in
    // deliberately sends no role at all.
    // The session already knows what this browser last held, and sending one
    // from here would demote a returning creator to a browsing account every
    // time they came back.
    const payload = signup ? { ...values, role: SIGNUP_ROLE } : values;
    const found = validateAuth(payload, mode);
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      await signIn(payload, mode);
      navigate(next, { replace: true });
    } catch (error) {
      setErrors({ password: messageFor(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas px-5 py-10 lg:py-16">
      {/* The lit canvas. Two washes, both brand, both far enough out of the
          way that nothing behind the card competes with the card. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-40 size-[26rem] rounded-full bg-brand/25 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 size-[24rem] rounded-full bg-brand-2/25 blur-3xl"
      />

      <div className="relative mx-auto flex w-full max-w-[440px] flex-col">
        <header className="flex flex-col items-center text-center">
          <Link href="/" aria-label="Home">
            <Wordmark size="lg" />
          </Link>
          <h1 className="mt-7 text-[30px] font-extrabold leading-tight text-ink lg:text-[34px]">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 max-w-[19rem] text-[14px] leading-relaxed text-muted">
            {signup
              ? "One account for your ads, saved items and status."
              : "Sign in to manage your ads and saved items."}
          </p>
        </header>

        <div className="glass mt-7 rounded-sheet p-5 shadow-lift ring-1 ring-white/60 sm:p-6">
          <SegmentedControl
            label="Sign in or create an account"
            options={MODES}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setErrors({});
            }}
          />

          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            {signup && (
              <Field label="Full name" error={errors.name}>
                <input
                  value={values.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Sarah Jenkins"
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
                signup ? (
                  "8 characters or more"
                ) : (
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
                  placeholder="••••••••"
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
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-brand hover:underline"
                  >
                    terms of service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-semibold text-brand hover:underline"
                  >
                    privacy policy
                  </Link>
                  .
                  {errors.accepted && (
                    <span
                      role="alert"
                      className="mt-1 block font-semibold text-danger"
                    >
                      {errors.accepted}
                    </span>
                  )}
                </span>
              </label>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "Please wait…" : signup ? "Create account" : "Sign in"}
              <ArrowRight className="size-5" strokeWidth={2.5} />
            </Button>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] font-medium text-muted">
            <Lock className="size-3.5 shrink-0" strokeWidth={2.2} />
            We never post anything without asking.
          </p>

          {/* Demo accounts. Below the form and visually quieter than it, because
              the form is still the thing this screen is for — but on the card
              rather than under it, since on this build they are the only way to
              reach the browsing view at all. Each row signs in as its role, and
              prints the credentials so they can be typed in by hand instead. */}
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Or try a demo account
            </p>

            <div className="space-y-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  disabled={pending}
                  onClick={() => signInAs(account)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-card active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon
                      name={ACCOUNT_ROLES[account.role].icon}
                      className="size-[18px]"
                      strokeWidth={2.3}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink">
                      {account.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
                      {account.blurb}
                    </span>
                    {/* Selectable, so they can be copied into the form above.
                        A slash separator rather than two lines: the pair is one
                        credential and reads as one. */}
                    <span className="mt-1 block truncate font-mono text-[11px] text-muted">
                      {account.email} / {account.password}
                    </span>
                  </span>

                  <ArrowRight
                    className="size-4 shrink-0 text-muted"
                    strokeWidth={2.4}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[13px] text-muted">
          <Link href="/" className="font-semibold text-brand hover:underline">
            Skip for now
          </Link>{" "}
          and browse as a guest.
        </p>

        {/* The pitch, reduced to the three things that are true of the account
            rather than of the site. Under the card, out of the way. */}
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] font-semibold text-muted">
          {[
            "Post in under a minute",
            "ID-checked sellers",
            "Ads and status",
          ].map((line) => (
            <li key={line} className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-brand" strokeWidth={2.4} />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
