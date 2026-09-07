"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "../lib/nav";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { profile as mockProfile } from "../data/mock";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateDetails(values) {
  const errors = {};
  if (values.name.trim().length < 2) errors.name = "Enter your name.";
  if (!EMAIL.test(values.email.trim()))
    errors.email = "Enter a valid email address.";
  const digits = values.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15)
    errors.phone = "Enter a phone number with 7-15 digits.";
  if (!values.location.trim()) errors.location = "Add a location.";
  return errors;
}

export default function PersonalDetails() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, refreshSession } = useAuth();
  const [values, setValues] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: "",
    location: "",
    bio: "",
  });
  const [errors, setErrors] = useState({});
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api("/me/profile")
      .then((details) => {
        if (!active) return;
        setValues({
          name: details.name ?? "",
          email: details.email ?? "",
          phone: details.phone ?? "",
          location: details.location ?? "",
          bio: details.bio ?? "",
        });
        setAvatarUrl(details.avatarUrl);
      })
      .catch((error) => {
        if (active) toast(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

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
    const found = validateDetails(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await api("/me/profile", { method: "PATCH", body: values });
      await refreshSession();
      toast("Details saved");
      navigate("/profile/settings");
    } catch (error) {
      const fieldErrors = Object.fromEntries(
        (error.details ?? []).map(({ field, message }) => [field, message]),
      );
      setErrors(fieldErrors);
      if (!error.details?.length) toast(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SubPageBar title="Personal details" fallback="/profile/settings" />

      <PageBody className="px-4 pb-8 pt-3 lg:max-w-2xl lg:px-8 lg:py-6">
        <form onSubmit={save} noValidate>
          <div className="mb-4 flex items-center gap-4 rounded-card bg-surface p-4 shadow-card">
            <img
              src={avatarUrl ?? mockProfile.avatar}
              alt=""
              className="size-16 shrink-0 rounded-2xl object-cover"
            />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink">Profile photo</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Shown on every ad you post.
              </p>
              <button
                type="button"
                onClick={() => toast("Photo uploads arrive in the Media module")}
                className="mt-1.5 text-[13px] font-bold text-brand hover:underline"
              >
                Change photo
              </button>
            </div>
          </div>

          <fieldset
            disabled={loading || saving}
            className="space-y-4 rounded-card bg-surface p-4 shadow-card disabled:opacity-60 lg:p-5"
          >
            <Field label="Full name" error={errors.name}>
              <input
                value={values.name}
                onChange={(e) => patch({ name: e.target.value })}
                className={`${FIELD} ${border(errors.name)}`}
                autoComplete="name"
              />
            </Field>

            <Field label="Email" error={errors.email}>
              <input
                type="email"
                value={values.email}
                onChange={(e) => patch({ email: e.target.value })}
                className={`${FIELD} ${border(errors.email)}`}
                autoComplete="email"
              />
            </Field>

            <Field label="Phone" error={errors.phone}>
              <input
                type="tel"
                value={values.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                className={`${FIELD} ${border(errors.phone)}`}
                autoComplete="tel"
              />
            </Field>

            <Field label="Location" error={errors.location}>
              <input
                value={values.location}
                onChange={(e) => patch({ location: e.target.value })}
                className={`${FIELD} ${border(errors.location)}`}
              />
            </Field>

            <Field label="About" hint={`${values.bio.length}/200`}>
              <textarea
                rows={4}
                maxLength={200}
                value={values.bio}
                onChange={(e) => patch({ bio: e.target.value })}
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>
          </fieldset>

          <div className="mt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => navigate("/profile/settings")}
            >
              Cancel
            </Button>
            <Button disabled={loading || saving} type="submit" size="lg" className="flex-[1.4]">
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </PageBody>
    </>
  );
}
