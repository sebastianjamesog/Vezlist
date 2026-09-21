"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminAuth, ConsoleAccessError } from "../context/AdminAuthContext";
import { useNavigate } from "../lib/nav";
import { safeNext } from "../lib/redirect";
import { validateAuth } from "../lib/auth";
import { ApiError } from "../lib/api/client";

/**
 * The console's front door.
 *
 * It reuses `validateAuth` — the same validator the public form runs — because
 * "is this a well-formed email and a long enough password" is the same
 * question on both sides. What it does *not* reuse is the public `Login`
 * screen: that one offers sign-up, and there is no such thing as signing
 * yourself up to a moderation console.
 *
 * The password is checked for real, against `POST /api/v1/auth/login` — see
 * `AdminAuthContext`. A 401 reads as a wrong email/password; a
 * `ConsoleAccessError` means the credentials were fine but the account has
 * no console role, and gets its own wording rather than being folded into
 * "wrong password".
 */
export default function AdminLogin() {
  const { signIn, signedIn, ready } = useAdminAuth();
  const navigate = useNavigate();
  const params = useSearchParams();
  // Same-origin only — see `safeNext` in redirect.js.
  const next = safeNext(params.get("next"));

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in and back on the form — send them where they were going.
  useEffect(() => {
    if (ready && signedIn) navigate(next, { replace: true });
  }, [ready, signedIn, navigate, next]);

  async function submit(e) {
    e.preventDefault();
    const found = validateAuth({ ...values, name: "" }, "signin");
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await signIn(values);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ConsoleAccessError) {
        setFormError(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setFormError("Wrong email or password.");
      } else if (err instanceof ApiError) {
        setFormError(err.message || "Something went wrong. Try again.");
      } else {
        setFormError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const set = (key) => (e) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <main className="flex min-h-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <span className="brand-gradient grid size-12 shrink-0 place-items-center rounded-2xl text-on-brand">
            <Icon name="Gauge" className="size-6" strokeWidth={2.6} />
          </span>
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight text-ink">
              Vezlist Console
            </h1>
            <p className="text-[14px] text-muted">
              Moderation for both boards.
            </p>
          </div>
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-4 rounded-card bg-surface p-6 shadow-card"
        >
          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-red-700"
            >
              {formError}
            </p>
          )}

          <Field label="Work email" error={errors.email}>
            <input
              type="email"
              value={values.email}
              onChange={set("email")}
              autoComplete="username"
              autoFocus
              placeholder="priya@vezlist.cc"
              className={`${FIELD} ${border(errors.email)}`}
            />
          </Field>

          <Field label="Password" error={errors.password}>
            <input
              type="password"
              value={values.password}
              onChange={set("password")}
              autoComplete="current-password"
              placeholder="At least 8 characters"
              className={`${FIELD} ${border(errors.password)}`}
            />
          </Field>

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>

          <div className="rounded-xl bg-canvas p-3.5">
            <p className="mb-1.5 text-[12.5px] font-bold text-ink">
              Seeded account
            </p>
            <button
              type="button"
              onClick={() =>
                setValues({ email: "admin@vezlist.cc", password: "" })
              }
              className="text-[13px] font-semibold text-brand hover:underline"
            >
              admin@vezlist.cc
            </button>
            <p className="mt-2 text-[12px] leading-snug text-muted">
              A real password, checked by the server — this only fills in the
              email. Only accounts with the Moderator or Admin role can get
              past this screen.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
