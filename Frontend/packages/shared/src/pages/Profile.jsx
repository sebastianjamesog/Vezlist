"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import {
  Camera,
  ChevronRight,
  LogOut,
  MapPin,
  Plus,
  UserRound,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import PageBody from "../components/layout/PageBody";
import { useShell } from "../components/layout/AppLayout";
import Icon from "../components/ui/Icon";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import MediaImage from "../components/media/MediaImage.jsx";
import { useStatus } from "../context/StatusContext";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext";
import { IS_PERSONALS } from "../lib/sites";
import { getUnreadCount } from "../lib/api/notifications";
import { getProfile } from "../lib/api/users";
import { ownedListingSummary } from "../lib/api/listings";
import { listSavedListings } from "../lib/api/saved";
import { SITE_SCOPE } from "../lib/api/client";
import { useProfileResource } from "../lib/useProfileResource";
import { profileMenu } from "../data/profileMenu";

const tones = {
  brand: "brand-gradient text-on-brand",
  soft: "bg-brand-soft text-brand",
  grey: "bg-canvas text-ink",
};

async function loadActiveAds() {
  const response = await ownedListingSummary(SITE_SCOPE);
  if (!Number.isSafeInteger(response?.activeAds) || response.activeAds < 0) {
    throw new Error("Invalid active-ad count");
  }
  return response.activeAds;
}

async function loadSavedAds() {
  // totalCount includes the full accessible list, not just a locally loaded page.
  const response = await listSavedListings({ site: SITE_SCOPE, limit: 1 });
  if (!Number.isSafeInteger(response?.totalCount) || response.totalCount < 0) {
    throw new Error("Invalid saved-ad count");
  }
  return response.totalCount;
}

function Stat({ resource, label }) {
  return (
    <div className="flex-1 rounded-2xl bg-on-brand/15 px-2 py-2.5 text-center backdrop-blur-sm">
      {resource.status === "success" ? (
        <p className="text-[20px] font-extrabold leading-none text-on-brand">
          {resource.data.toLocaleString()}
        </p>
      ) : resource.status === "error" ? (
        <p className="text-[13px] font-semibold text-on-brand">Unavailable</p>
      ) : (
        <span
          role="status"
          aria-label={`Loading ${label.toLowerCase()}`}
          className="mx-auto block h-5 w-10 rounded bg-on-brand/20"
        />
      )}
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-on-brand/75">
        {label}
      </p>
      {resource.status === "error" && (
        <button
          type="button"
          onClick={resource.retry}
          aria-label={`Retry ${label.toLowerCase()}`}
          className="mt-1 text-xs font-semibold text-on-brand underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default function Profile() {
  const { myUpdates } = useStatus();
  const toast = useToast();
  const { user, signOut, signedIn } = useAuth();
  const { can, isCreator, roleMeta } = useAccount();
  const { openStory } = useShell();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const userId = signedIn ? user?.id : null;
  const profile = useProfileResource(userId, getProfile);
  const activeAds = useProfileResource(
    isCreator ? userId : null,
    loadActiveAds,
  );
  const savedAds = useProfileResource(userId, loadSavedAds);
  const savedCount = savedAds.status === "success" ? savedAds.data : null;
  const displayName = profile.data?.name || user?.name || "Your profile";

  // The menu is where the two account views actually diverge. A row that names
  // a capability exists only for the roles that hold it, so a browsing account
  // never sees My Ads or the dashboard — rather than seeing them and finding
  // them empty, which is the version that makes people think the app is broken.
  // Hiding the row is not the guard: the screens themselves still sit behind
  // RequireCapability, because a bookmark never goes through this list.
  const menu = profileMenu.filter((item) => !item.cap || can(item.cap));

  // Same endpoint the bell in TopBar reads (GET
  // /api/v1/me/notifications/unread-count) — one source for whether either
  // dot is allowed to show. Best-effort: a failed fetch just leaves it off.
  const [unread, setUnread] = useState(null);
  const hasUnread = unread?.userId === userId && unread?.count > 0;
  useEffect(() => {
    setUnread(null);
    if (!userId) return;
    let cancelled = false;
    getUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread({ userId, count: count.count });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Weekly analytics and account verification have no backend contract yet.
  // Only display supported, session-owned values, never demo stand-ins.
  const stats = isCreator
    ? [
        { label: "Active ads", resource: activeAds },
        { label: "Saved", resource: savedAds },
      ]
    : [{ label: "Saved", resource: savedAds }];

  return (
    <>
      <TopBar title="Profile" />

      <PageBody className="px-4 pb-6 pt-top lg:px-8 lg:py-8">
        <div className="lg:grid lg:grid-cols-[380px_1fr] lg:items-start lg:gap-8">
          <div className="lg:sticky lg:top-6">
            {/* Gradient hero: identity first, numbers second. */}
            <section
              aria-label="Your profile"
              className="brand-gradient relative overflow-hidden rounded-card p-5 shadow-lift lg:p-6"
            >
              <span
                aria-hidden="true"
                className="absolute -right-10 -top-10 size-40 rounded-full bg-on-brand/15 blur-2xl"
              />

              <div className="relative flex items-center gap-4">
                <span className="relative shrink-0">
                  {profile.data?.avatarUrl ? (
                    <MediaImage
                      src={profile.data.avatarUrl}
                      alt={displayName}
                      width={80}
                      height={80}
                      className="size-20 rounded-3xl object-cover ring-4 ring-on-brand/30"
                    />
                  ) : (
                    <span
                      role="img"
                      aria-label="No profile photo"
                      className="grid size-20 place-items-center rounded-3xl bg-on-brand/15 text-on-brand ring-4 ring-on-brand/30"
                    >
                      <UserRound className="size-10" aria-hidden="true" />
                    </span>
                  )}
                </span>

                <div className="min-w-0">
                  <h1 className="truncate text-[24px] font-extrabold text-on-brand">
                    {displayName}
                  </h1>

                  {/* Which of the two views you are in, said out loud. The menu
                      below changes shape with the role and the hero stats change
                      with it; a screen that quietly grows and shrinks with
                      nothing naming the reason is what people file bugs about.
                      Settings owns the switch — this only reports the state. */}
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-on-brand/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-on-brand">
                    <Icon
                      name={roleMeta.icon}
                      className="size-3.5"
                      strokeWidth={2.6}
                    />
                    {roleMeta.label}
                  </p>

                  {profile.status === "success" && (
                    <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-on-brand/80">
                      <MapPin
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {profile.data.location || "Location not set"}
                    </p>
                  )}
                  {profile.status === "loading" && (
                    <p
                      role="status"
                      className="mt-1.5 text-[13px] text-on-brand/80"
                    >
                      Loading profile...
                    </p>
                  )}
                  {profile.status === "error" && (
                    <div
                      role="alert"
                      className="mt-1.5 text-[13px] text-on-brand"
                    >
                      <p>Profile details unavailable.</p>
                      <button
                        type="button"
                        onClick={profile.retry}
                        className="font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Retry profile
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {userId && (
                <div className="relative mt-5 flex gap-2">
                  {stats.map((s) => (
                    <Stat key={s.label} resource={s.resource} label={s.label} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="mt-4 lg:mt-0">
            <nav className="overflow-hidden rounded-card bg-surface shadow-card lg:grid lg:grid-cols-2 lg:gap-px lg:bg-line">
              {/* Your story starts here, and only on personals.

                  It used to be the first tile in the board's story rail — a
                  composer wearing the same ring as everybody else's photos,
                  which made the one thing you can *do* look like one more
                  thing to scroll past. It belongs with the other rows about
                  your own account, so this is where it went.

                  The row is written out here rather than added to profileMenu
                  because it is not a plain link: it opens the composer the
                  shell hosts. That is also why it leads the list — it is an
                  action, and the rest of these are destinations.

                  Once you have posted, it is two controls rather than one.
                  The rail on the board deliberately drops `mine` (see
                  `groupStatuses`), so without a way in from here the story
                  you just posted would be reachable only by typing
                  /status/me — you could add to a story you could never
                  watch. The left three-quarters opens the player, the plus
                  on the right adds another update, and they are siblings
                  rather than nested because a <button> inside an <a> is not
                  a thing a browser will do.

                  The marketplace has no stories at all, so none of it ever
                  renders. A browsing account does render it and gets told
                  why it cannot post — `openStory` asks that question, the
                  same way it asks it for the create chooser — which is the
                  treatment every other creator-only control in this build
                  gives: a sentence beats a dead button. */}
              {IS_PERSONALS &&
                (myUpdates.length ? (
                  <div className="flex w-full items-center border-b border-line bg-surface lg:border-0">
                    <Link
                      href="/status/me"
                      className="flex min-w-0 flex-1 items-center gap-3.5 p-4 text-left transition-colors hover:bg-canvas"
                    >
                      <span className="brand-gradient grid size-11 shrink-0 place-items-center rounded-2xl text-on-brand">
                        <Camera className="size-[22px]" strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-bold leading-tight text-ink">
                          Your story
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted">
                          {myUpdates.length}{" "}
                          {myUpdates.length === 1 ? "update" : "updates"} · each
                          clears 24 hours after it was posted
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={openStory}
                      aria-label="Add to your story"
                      className="mr-3 grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand transition-transform active:scale-95"
                    >
                      <Plus className="size-5" strokeWidth={2.6} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openStory}
                    className="flex w-full items-center gap-3.5 border-b border-line bg-surface p-4 text-left transition-colors hover:bg-canvas lg:border-0"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                      <Camera className="size-[22px]" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold leading-tight text-ink">
                        Add a story
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        A photo on the board for 24 hours
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted" />
                  </button>
                ))}

              {menu.map((item) => (
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
                    {item.id === "notifications" && hasUnread && (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-surface" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold leading-tight text-ink">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      {/* Two rows say more when they say the live number than
                          when they say what the screen is for. */}
                      {item.id === "saved" && savedCount !== null
                        ? `${savedCount} saved ${savedCount === 1 ? "ad" : "ads"}`
                        : item.sub}
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
