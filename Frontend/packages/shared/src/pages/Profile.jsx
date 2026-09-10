"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { BadgeCheck, ChevronRight, LogOut, MapPin, Star } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import PageBody from "../components/layout/PageBody";
import Icon from "../components/ui/Icon";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useSaved } from "../context/SavedStore";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { profile as mockProfile, profileMenu } from "../data/mock";

const tones = {
  brand: "brand-gradient text-on-brand",
  soft: "bg-brand-soft text-brand",
  grey: "bg-canvas text-ink",
};

function Stat({ value, label }) {
  return (
    <div className="flex-1 rounded-2xl bg-on-brand/15 px-2 py-2.5 text-center backdrop-blur-sm">
      <p className="text-[20px] font-extrabold leading-none text-on-brand">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-on-brand/75">
        {label}
      </p>
    </div>
  );
}

export default function Profile() {
  const {
    count: savedCount,
    countKnown: savedCountKnown,
    loading: savedLoading,
  } = useSaved();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [details, setDetails] = useState(null);
  const savedSubtitle = savedLoading
    ? "Loading saved items..."
    : savedCountKnown
      ? `${savedCount} saved ${savedCount === 1 ? "ad" : "ads"}`
      : "View your bookmarked ads";

  useEffect(() => {
    let active = true;
    api("/me/profile")
      .then((next) => {
        if (active) setDetails(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <TopBar title="Profile" />

      <PageBody className="px-4 pb-6 pt-4 lg:px-8 lg:py-8">
        <div className="lg:grid lg:grid-cols-[380px_1fr] lg:items-start lg:gap-8">
          {/* Gradient hero: identity first, numbers second. */}
          <section className="brand-gradient relative overflow-hidden rounded-card p-5 shadow-lift lg:sticky lg:top-6 lg:p-6">
            <span
              aria-hidden="true"
              className="absolute -right-10 -top-10 size-40 rounded-full bg-on-brand/15 blur-2xl"
            />

            <div className="relative flex items-center gap-4">
              <span className="relative shrink-0">
                <img
                  src={details?.avatarUrl ?? mockProfile.avatar}
                  alt={details?.name ?? user?.name ?? mockProfile.name}
                  className="size-20 rounded-3xl object-cover ring-4 ring-on-brand/30"
                />
                {(details?.emailVerified ?? user?.emailVerified) && (
                  <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-on-brand">
                    <BadgeCheck
                      className="size-5 text-brand"
                      strokeWidth={2.6}
                    />
                  </span>
                )}
              </span>

              <div className="min-w-0">
                <h1 className="truncate text-[24px] font-extrabold text-on-brand">
                  {details?.name ?? user?.name ?? mockProfile.name}
                </h1>
                <p className="mt-1 flex items-center gap-1 text-[13px] font-medium text-on-brand/80">
                  <MapPin className="size-3.5" />
                  {details?.location ?? "Location not added"}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-[13px] font-bold text-on-brand">
                  <Star className="size-4 fill-amber-300 text-amber-300" />
                  {mockProfile.rating}
                  <span className="font-medium text-on-brand/70">
                    ({mockProfile.reviews} reviews)
                  </span>
                </p>
              </div>
            </div>

            <div className="relative mt-5 flex gap-2">
              <Stat value={mockProfile.activeAds} label="Active ads" />
              <Stat value={mockProfile.yearsActive} label="Years active" />
              <Stat value={savedCountKnown ? savedCount : "—"} label="Saved" />
            </div>
          </section>

          <div className="mt-4 lg:mt-0">
            <nav className="overflow-hidden rounded-card bg-surface shadow-card lg:grid lg:grid-cols-2 lg:gap-px lg:bg-line">
              {profileMenu.map((item) => (
                <Link
                  key={item.id}
                  href={item.to}
                  className="flex w-full items-center gap-3.5 border-b border-line bg-surface p-4 text-left transition-colors last:border-0 hover:bg-canvas lg:border-0"
                >
                  <span
                    className={`relative grid size-11 shrink-0 place-items-center rounded-2xl ${tones[item.tone]}`}
                  >
                    <Icon
                      name={item.icon}
                      className="size-[22px]"
                      strokeWidth={2.2}
                    />
                    {item.dot && (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-surface" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold leading-tight text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      {item.id === "saved" ? savedSubtitle : item.sub}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted" />
                </Link>
              ))}
            </nav>

            <button
              onClick={() => setConfirmLogout(true)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-card bg-surface py-3.5 text-[16px] font-bold text-danger shadow-card transition-colors hover:bg-danger-soft lg:hidden"
            >
              <LogOut className="size-5 rotate-180" strokeWidth={2.4} />
              Log out
            </button>
          </div>
        </div>
      </PageBody>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        body="You'll need to sign in again to manage your ads."
        confirmLabel="Log out"
        destructive
        onConfirm={() => {
          setConfirmLogout(false);
          signOut();
          toast("Logged out");
          navigate("/login", { replace: true });
        }}
        onClose={() => setConfirmLogout(false)}
      />
    </>
  );
}
