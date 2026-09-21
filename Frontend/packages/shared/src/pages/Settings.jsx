"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { ChevronRight, Flag, LogOut, UserRoundX } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { LEGAL_LINKS } from "../components/layout/legalLinks";
import Icon from "../components/ui/Icon";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext";
import { useSaved } from "../context/SavedContext";
import { useStatus } from "../context/StatusContext";
import { useReports } from "../context/ReportsContext";
import { usePersistedObject } from "../lib/persisted";
import { ACCOUNT_ROLES, ACCOUNT_ROLE_LIST } from "../lib/accountRoles";
import { DEFAULT_TOGGLES, SETTINGS_TOGGLES_KEY } from "../lib/listings";
import { IS_PERSONALS, SITE_NAME } from "../lib/sites";
import { settingsGroups } from "../data/mock";
import * as usersApi from "../lib/api/users";
import { ApiError } from "../lib/api/client";

/**
 * The only four toggles in `settingsGroups` the backend actually has a field
 * for (UserPreferenceDetails: pushNotifications, emailUpdates,
 * showPhoneOnAds, preciseLocation). `contactEmail` (whether an email shows on
 * an ad) and `available` (personals "available now") have no server-side
 * counterpart yet, so those two stay exactly what they were — a per-device
 * preference in `usePersistedObject` — while these four are read from and
 * written to `GET`/`PATCH /api/v1/me/preferences`.
 */
const BACKEND_TOGGLE_KEYS = {
  push: "pushNotifications",
  email: "emailUpdates",
  phone: "showPhoneOnAds",
  location: "preciseLocation",
};

function messageFor(error) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Check your connection and try again.";
}

/**
 * Groups this build has any use for.
 *
 * A group marked `personalsOnly` describes something only the personals board
 * can act on — today that is Availability, whose switch decides whether a post
 * is reachable through the `availableOnly` filter, and that filter exists on
 * one board. It is dropped rather than rendered disabled: a greyed switch is a
 * promise that it will mean something here one day, and on the marketplace it
 * never will. There is nothing to explain to a reader who was never shown it.
 *
 * Note what this does *not* touch. `DEFAULT_TOGGLES` in `lib/listings.js` is
 * still built from every group in the seed, on every build, so a key this
 * screen never renders still has a defined default and every reader of the
 * stored object keeps answering rather than reading `undefined`. Filtering
 * here removes a control, not a preference — which is what makes it safe to
 * hide one group on one board while a single stored object serves them all.
 */
const groupsForThisSite = settingsGroups.filter(
  (g) => !g.personalsOnly || IS_PERSONALS,
);

/**
 * The key and the defaults moved to `lib/listings.js` with issue #25 and are
 * imported back here.
 *
 * Not tidying: the "Show phone on ads" switch below is now read by the ad
 * detail page to decide whether a number may be revealed at all, so the key
 * has two readers. Two modules spelling the same localStorage key by hand is
 * how a preference silently stops applying, and the reader that would notice
 * is a seller finding their number on a board they took it off.
 */

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-brand" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export default function Settings() {
  const toast = useToast();
  const { signOut } = useAuth();
  const { role, roleMeta, setRole, resetWallet } = useAccount();
  const { ids: savedIds, remove: removeSaved } = useSaved();
  const { clearSeen } = useStatus();
  const { reports, blocked, unblock, clear: clearReports } = useReports();
  const navigate = useNavigate();
  // `stored` is null until hydration lands and again if nothing was ever
  // saved — either way the defaults below fill the gap, so the toggle a
  // reader sees before and after hydration never disagree with itself.
  const [stored, setStored, , clearToggles] =
    usePersistedObject(SETTINGS_TOGGLES_KEY);
  // The four backend-backed switches (see BACKEND_TOGGLE_KEYS) overlay
  // `stored` once GET /api/v1/me/preferences answers; until then the local
  // defaults render so the toggle never flashes empty.
  const [serverPrefs, setServerPrefs] = useState(null);
  const [prefsError, setPrefsError] = useState(null);
  const [prefsPending, setPrefsPending] = useState(null);
  const toggles = {
    ...DEFAULT_TOGGLES,
    ...stored,
    ...(serverPrefs && {
      push: serverPrefs.pushNotifications,
      email: serverPrefs.emailUpdates,
      phone: serverPrefs.showPhoneOnAds,
      location: serverPrefs.preciseLocation,
    }),
  };
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadPreferences = () => {
    setPrefsError(null);
    usersApi
      .getPreferences()
      .then(setServerPrefs)
      .catch((error) => setPrefsError(messageFor(error)));
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  async function toggleBacked(id) {
    if (!serverPrefs) return;
    const next = {
      pushNotifications: serverPrefs.pushNotifications,
      emailUpdates: serverPrefs.emailUpdates,
      showPhoneOnAds: serverPrefs.showPhoneOnAds,
      preciseLocation: serverPrefs.preciseLocation,
    };
    const key = BACKEND_TOGGLE_KEYS[id];
    next[key] = !next[key];
    setPrefsPending(id);
    try {
      const saved = await usersApi.updatePreferences(next);
      setServerPrefs(saved);
      toast(`${settingsGroups.flatMap((g) => g.items).find((i) => i.id === id)?.label ?? "Preference"} ${next[key] ? "on" : "off"}`);
    } catch (error) {
      toast(messageFor(error));
    } finally {
      setPrefsPending(null);
    }
  }

  /**
   * Becoming a creator adds screens and takes nothing away, so it just happens.
   * Going back the other way removes My Ads, the dashboard and promoting from
   * an account that may be using all three — that is a question, not a tap.
   */
  function switchRole(id) {
    if (id === "user") {
      setConfirm("downgrade");
      return;
    }
    setRole(id);
    toast(`Account type: ${ACCOUNT_ROLES[id].label}`);
  }

  return (
    <>
      <SubPageBar title="Account Settings" fallback="/profile" />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {/* Built here rather than in `settingsGroups`, because every row in
              that data is a label and a destination and this one is a live
              value with two branches. It sits first: what kind of account this
              is decides what half the other rows are even for. */}
          <section className="mb-5 lg:mb-0">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Account type
            </h2>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {ACCOUNT_ROLE_LIST.map((option, i) => {
                const current = option.id === role;
                const inner = (
                  <>
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                        current
                          ? "brand-gradient text-on-brand"
                          : "bg-canvas text-brand"
                      }`}
                    >
                      <Icon
                        name={option.icon}
                        className="size-5"
                        strokeWidth={2.2}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[16px] font-semibold leading-tight text-ink">
                        {option.label}
                        {current && (
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                            Current
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                        {option.blurb}
                      </span>
                    </span>
                  </>
                );

                const rowClass = `flex w-full items-center gap-3 p-4 text-left ${
                  i ? "border-t border-line" : ""
                }`;

                // The current type is a statement, not a control — a button
                // that does nothing is worse than no button, and a disabled one
                // drops out of the tab order along with its explanation.
                return current ? (
                  <div key={option.id} className={rowClass}>
                    {inner}
                  </div>
                ) : (
                  <button
                    key={option.id}
                    onClick={() => switchRole(option.id)}
                    aria-label={`Switch to ${option.label}`}
                    className={`${rowClass} transition-colors hover:bg-canvas`}
                  >
                    {inner}
                    <ChevronRight className="size-5 shrink-0 text-muted" />
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 px-1 text-[12px] text-muted">
              You are set to {roleMeta.label}. Credits stay with the account
              either way.
            </p>
          </section>

          {prefsError && (
            <section className="mb-5 lg:col-span-2 lg:mb-0">
              <div className="flex items-center justify-between gap-3 rounded-card bg-danger-soft p-4 text-[13px] text-danger shadow-card">
                <span>Couldn't load your notification and privacy preferences: {prefsError}</span>
                <button
                  type="button"
                  onClick={loadPreferences}
                  className="shrink-0 font-bold underline"
                >
                  Retry
                </button>
              </div>
            </section>
          )}

          {groupsForThisSite.map((group) => (
            <section key={group.title} className="mb-5 lg:mb-0">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                {group.title}
              </h2>
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                {group.items.map((item, i) => {
                  const inner = (
                    <>
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                        <Icon
                          name={item.icon}
                          className="size-5"
                          strokeWidth={2.2}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold leading-tight text-ink">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-muted">
                          {item.sub}
                        </span>
                      </span>
                    </>
                  );

                  const rowClass = `flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-canvas ${
                    i ? "border-t border-line" : ""
                  }`;

                  if (item.type === "link" && item.to) {
                    return (
                      <Link key={item.id} href={item.to} className={rowClass}>
                        {inner}
                        <ChevronRight className="size-5 shrink-0 text-muted" />
                      </Link>
                    );
                  }

                  const isBacked = item.id in BACKEND_TOGGLE_KEYS;

                  return item.type === "toggle" ? (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-4 ${i ? "border-t border-line" : ""}`}
                    >
                      {inner}
                      <Toggle
                        label={item.label}
                        checked={toggles[item.id]}
                        disabled={
                          (isBacked && (!serverPrefs || prefsPending === item.id))
                        }
                        onChange={() => {
                          if (isBacked) {
                            toggleBacked(item.id);
                            return;
                          }
                          setStored({
                            ...toggles,
                            [item.id]: !toggles[item.id],
                          });
                          toast(
                            `${item.label} ${toggles[item.id] ? "off" : "on"}`,
                          );
                        }}
                      />
                    </div>
                  ) : (
                    // Every row in `settingsGroups` today is a link or a
                    // toggle; this only exists so a future row that is
                    // neither renders as what it is — informational — rather
                    // than as a button that promises a tap does something.
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-4 ${i ? "border-t border-line" : ""}`}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/*
            Safety (#4). Built here rather than in `settingsGroups` for the
            same reason the account-type block above it is: those rows are a
            label and a destination, and these two are live lists.

            It is the receipt for both controls, and the two halves are
            deliberately not described in the same words. A block is finished:
            it is enforced in this browser, which is the only place it needs to
            be enforced, so it says what it did. A report is not: there is no
            server and the moderation console is a separate origin with its own
            storage (#10), so it says that too — plainly, next to the report
            itself, rather than in a toast the reporter saw once and a queue
            entry nobody will ever action.
          */}
          <section className="mb-5 lg:mb-0">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Safety
            </h2>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              <div className="p-4">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                    <UserRoundX className="size-5" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold leading-tight text-ink">
                      Blocked accounts
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      {blocked.length
                        ? "Their ads are hidden from your feed on this device."
                        : "Block a seller from their profile or from any ad."}
                    </span>
                  </span>
                </span>

                {blocked.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {blocked.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-2.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                          {b.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            unblock(b.id);
                            toast(`${b.name} unblocked`);
                          }}
                          className="shrink-0 text-[14px] font-bold text-brand hover:underline"
                        >
                          Unblock
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-line p-4">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                    <Flag className="size-5" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold leading-tight text-ink">
                      Reports you've made
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                      {reports.length
                        ? "Saved on this device. This preview has no server, so none of these has reached a moderator yet."
                        : "Report an ad, a seller or a live broadcast and it will be listed here."}
                    </span>
                  </span>
                </span>

                {reports.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {reports.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl bg-canvas px-3.5 py-2.5"
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-[15px] font-semibold text-ink">
                            {r.reason}
                          </span>
                          <span className="shrink-0 text-[12px] font-bold uppercase tracking-wide text-muted">
                            {r.targetType}
                          </span>
                        </span>
                        {r.detail && (
                          <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                            {r.detail}
                          </span>
                        )}
                        <span className="mt-1 block text-[12px] font-semibold text-amber-700">
                          Waiting to be sent
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/*
            Legal — the phone's half of what `Footer` draws on desktop.

            The footer used to sit at the bottom of every screen the shell
            wraps, which on a phone meant it reserved room for itself and the
            floating tab bar under a feed nobody reads the bottom of. It is
            `lg:hidden` here and `hidden lg:block` there, so exactly one of the
            two is on screen at any width and neither is a duplicate of the
            other. Both read `LEGAL_LINKS`, so the personals-only pages appear
            in both places or neither.
          */}
          <section className="mb-5 lg:mb-0 lg:hidden">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Legal
            </h2>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              {LEGAL_LINKS.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 p-4 transition-colors hover:bg-canvas ${
                    i ? "border-t border-line" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 text-[16px] font-semibold leading-tight text-ink">
                    {link.label}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted"
                    strokeWidth={2.4}
                  />
                </Link>
              ))}
              <p className="border-t border-line px-4 py-3 text-[12px] font-medium text-muted">
                &copy; {new Date().getFullYear()} {SITE_NAME}
              </p>
            </div>
          </section>
        </div>

        <div className="mt-2 space-y-3 lg:max-w-md">
          <button
            onClick={() => setConfirm("logout")}
            className="flex w-full items-center justify-center gap-2 rounded-card bg-surface py-3.5 text-[16px] font-semibold text-danger shadow-card transition-colors hover:bg-danger-soft"
          >
            <LogOut className="size-5 rotate-180" strokeWidth={2.5} />
            Log Out
          </button>
          <button
            onClick={() => setConfirm("delete")}
            className="w-full rounded-2xl py-3 text-[14px] font-semibold text-muted underline-offset-2 hover:underline"
          >
            Delete account
          </button>
        </div>
      </PageBody>

      <ConfirmDialog
        open={confirm === "logout"}
        title="Log out?"
        body="You'll need to sign in again to manage your ads."
        confirmLabel="Log out"
        destructive
        onConfirm={() => {
          setConfirm(null);
          signOut();
          toast("Logged out");
          navigate("/login", { replace: true });
        }}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "downgrade"}
        title={`Switch to ${ACCOUNT_ROLES.user.label}?`}
        body="My Ads, the creator dashboard and promoting all go away, and any ad you have running stays up with nowhere to manage it. Your credits stay in your balance. Switching back takes one tap."
        confirmLabel="Switch"
        destructive
        onConfirm={() => {
          setConfirm(null);
          setRole("user");
          toast(`Account type: ${ACCOUNT_ROLES.user.label}`);
        }}
        onClose={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete your account?"
        body="This removes your profile and every ad you've posted. It cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete account"}
        destructive
        onConfirm={async () => {
          if (deleting) return;
          setDeleting(true);
          try {
            // DELETE /api/v1/me only files the request server-side
            // (UserProfileController#requestDeletion -> 202 +
            // DeletionRequestDetails, status PENDING) — actual removal is a
            // backend process, not something this click waits on. Once the
            // request is filed, the rest of this clears everything this
            // build itself holds on the device (saved ads, watched statuses,
            // settings toggles, reports/blocks, the wallet balance) and signs
            // out the same way "Log out" above does.
            await usersApi.requestDeletion();
            setConfirm(null);
            savedIds.forEach(removeSaved);
            clearSeen();
            clearToggles();
            clearReports();
            resetWallet();
            await signOut();
            toast("Account deletion requested");
            navigate("/login", { replace: true });
          } catch (error) {
            toast(messageFor(error));
          } finally {
            setDeleting(false);
          }
        }}
        onClose={() => !deleting && setConfirm(null)}
      />
    </>
  );
}
