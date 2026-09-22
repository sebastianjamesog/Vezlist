"use client";

import { useState } from "react";
import { useNavigate } from "../lib/nav";
import { Check, Eye, EyeOff } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import * as usersApi from "../lib/api/users";
import { ApiError } from "../lib/api/client";

function messageFor(error) {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.code === "CURRENT_PASSWORD_INVALID") {
      return { current: error.message };
    }
    const detail = error.details?.[0];
    if (detail) return { [detail.field === "newPassword" ? "next" : "current"]: detail.message };
    return { current: error.message };
  }
  return { current: "Something went wrong. Check your connection and try again." };
}

export const RULES = [
  { id: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  {
    id: "case",
    label: "Upper and lower case",
    test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
  },
  { id: "number", label: "A number or symbol", test: (v) => /[\d\W]/.test(v) },
];

export function validatePassword({ current, next, confirm }) {
  const errors = {};
  if (!current) errors.current = "Enter your current password.";
  if (RULES.some((r) => !r.test(next)))
    errors.next = "Your new password is too weak.";
  if (next && confirm !== next) errors.confirm = "Passwords don't match.";
  return errors;
}

function Secret({ value, onChange, error, autoComplete, label }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-label={label}
        className={`${FIELD} ${border(error)} pr-12`}
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
  );
}

export default function PasswordSettings() {
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const patch = (next) => {
    setValues((v) => ({ ...v, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  };

  async function save(e) {
    e.preventDefault();
    const found = validatePassword(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await usersApi.changePassword({
        currentPassword: values.current,
        newPassword: values.next,
      });
      // Changing the password revokes this account's other sessions and
      // replaces this session's principal server-side (see
      // UserProfileController#changePassword), so the cached user is
      // refreshed rather than trusted stale.
      await refreshUser();
      toast("Password updated");
      navigate("/profile/settings");
    } catch (error) {
      setErrors(messageFor(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/*
        No "last changed" subtitle: the backend doesn't expose that date
        (UserProfileDetails/UserPreferenceDetails carry no password
        timestamp), and this used to be a fixed mock string unrelated to the
        signed-in account.
      */}
      <SubPageBar title="Password" fallback="/profile/settings" />

      <PageBody className="px-4 pb-8 pt-3 lg:max-w-2xl lg:px-8 lg:py-6">
        <form onSubmit={save} noValidate>
          <div className="space-y-4 rounded-card bg-surface p-4 shadow-card lg:p-5">
            <Field label="Current password" error={errors.current}>
              <Secret
                label="Current password"
                value={values.current}
                onChange={(v) => patch({ current: v })}
                error={errors.current}
                autoComplete="current-password"
              />
            </Field>

            <Field label="New password" error={errors.next}>
              <Secret
                label="New password"
                value={values.next}
                onChange={(v) => patch({ next: v })}
                error={errors.next}
                autoComplete="new-password"
              />
            </Field>

            <ul className="space-y-1.5">
              {RULES.map((rule) => {
                const met = rule.test(values.next);
                return (
                  <li
                    key={rule.id}
                    className="flex items-center gap-2 text-[13px]"
                  >
                    <span
                      className={`grid size-4 place-items-center rounded-full transition-colors ${
                        met
                          ? "bg-emerald-500 text-white"
                          : "bg-line text-transparent"
                      }`}
                    >
                      <Check className="size-3" strokeWidth={4} />
                    </span>
                    <span
                      className={met ? "font-semibold text-ink" : "text-muted"}
                    >
                      {rule.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            <Field label="Confirm new password" error={errors.confirm}>
              <Secret
                label="Confirm new password"
                value={values.confirm}
                onChange={(v) => patch({ confirm: v })}
                error={errors.confirm}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <Button type="submit" size="lg" className="mt-4 w-full" disabled={saving}>
            {saving ? "Updating…" : "Update password"}
          </Button>

          <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
            Changing your password signs you out on other devices.
          </p>
        </form>
      </PageBody>
    </>
  );
}
