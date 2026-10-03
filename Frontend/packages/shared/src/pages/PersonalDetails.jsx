"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "../lib/nav";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import Field, { FIELD, border } from "../components/create/Field";
import MediaImage from "../components/media/MediaImage.jsx";
import { Skeleton } from "../components/ui/Skeleton";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import * as usersApi from "../lib/api/users";
import { ApiError } from "../lib/api/client";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function messageFor(error) {
  if (error instanceof ApiError) {
    return error.details?.[0]?.message ?? error.message;
  }
  return "Something went wrong. Check your connection and try again.";
}

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
  const { ready, updateProfile: applyLocalProfilePatch, refreshUser } = useAuth();
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    bio: "",
  });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoadError(null);
    usersApi
      .getProfile()
      .then((p) => {
        setValues({
          name: p.name ?? "",
          email: p.email ?? "",
          phone: p.phone ?? "",
          location: p.location ?? "",
          bio: p.bio ?? "",
        });
        setAvatarUrl(p.avatarUrl ?? null);
        setLoaded(true);
      })
      .catch((error) => setLoadError(messageFor(error)));
  };

  useEffect(() => {
    if (!ready) return;
    load();
    // Runs once the session is ready, not on every retry click below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
    const patchValues = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      location: values.location.trim(),
      bio: values.bio,
    };
    setSaving(true);
    try {
      await usersApi.updateProfile(patchValues);
      // The backend replaces this session's principal when name/email
      // change (UserProfileController#updateProfile), so the cached
      // AuthContext user has to be re-fetched rather than trusted stale.
      await refreshUser();
      applyLocalProfilePatch(patchValues);
      toast("Details saved");
      navigate("/profile/settings");
    } catch (error) {
      setErrors({ email: messageFor(error) });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <>
        <SubPageBar title="Personal details" fallback="/profile/settings" />
        <PageBody className="px-4 pb-8 pt-3 lg:max-w-2xl lg:px-8 lg:py-6">
          <div className="rounded-card bg-surface p-6 text-center shadow-card">
            <p className="text-[15px] font-semibold text-ink">
              Couldn't load your details
            </p>
            <p className="mt-1 text-[13px] text-muted">{loadError}</p>
            <Button className="mt-4" onClick={load}>
              Try again
            </Button>
          </div>
        </PageBody>
      </>
    );
  }

  if (!loaded) {
    return (
      <>
        <SubPageBar title="Personal details" fallback="/profile/settings" />
        <PageBody className="px-4 pb-8 pt-3 lg:max-w-2xl lg:px-8 lg:py-6">
          <div className="mb-4 flex items-center gap-4 rounded-card bg-surface p-4 shadow-card">
            <Skeleton className="size-16 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[15px] w-1/2 rounded" />
              <Skeleton className="mt-2 h-[13px] w-2/3 rounded" />
            </div>
          </div>
          <div className="space-y-4 rounded-card bg-surface p-4 shadow-card lg:p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[46px] w-full rounded-xl" />
            ))}
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <SubPageBar title="Personal details" fallback="/profile/settings" />

      <PageBody className="px-4 pb-8 pt-3 lg:max-w-2xl lg:px-8 lg:py-6">
        <form onSubmit={save} noValidate>
          <div className="mb-4 flex items-center gap-4 rounded-card bg-surface p-4 shadow-card">
            {avatarUrl ? <MediaImage
              src={avatarUrl}
              alt=""
              width={64}
              height={64}
              className="size-16 shrink-0 rounded-2xl object-cover"
            /> : <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl font-bold text-brand">{values.name.charAt(0) || "?"}</span>}
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink">Profile photo</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Shown on every ad you post.
              </p>
              {/*
                Left as an honest stub rather than a data-URI preview.
                `AccountContext` already draws this line for card numbers —
                content that only lives in this demo's memory does not belong
                in the cookie session or in localStorage — and a photo is the
                same shape of problem: bigger, and worse to lose silently.
                Actually storing one needs somewhere durable to put it, which
                is the media backend #12 is blocked on, not a wiring issue in
                this screen. So the tap says exactly that instead of quietly
                doing nothing.
              */}
              <button
                type="button"
                onClick={() =>
                  toast(
                    "Photo uploads need a backend to store the image (#12) — not wired up yet",
                  )
                }
                className="mt-1.5 text-[13px] font-bold text-brand hover:underline"
              >
                Change photo
              </button>
            </div>
          </div>

          <div className="space-y-4 rounded-card bg-surface p-4 shadow-card lg:p-5">
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
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => navigate("/profile/settings")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              className="flex-[1.4]"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </PageBody>
    </>
  );
}
