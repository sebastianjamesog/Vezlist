"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { ChevronRight, LogOut } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Icon from "../components/ui/Icon";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { settingsGroups } from "../data/mock";
import { api } from "../lib/api";

const preferenceFields = {
  push: "pushNotifications",
  email: "emailUpdates",
  phone: "showPhoneOnAds",
  location: "preciseLocation",
};

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
  const navigate = useNavigate();
  const [toggles, setToggles] = useState(() =>
    Object.fromEntries(
      settingsGroups.flatMap((g) =>
        g.items.filter((i) => i.type === "toggle").map((i) => [i.id, i.value]),
      ),
    ),
  );
  const [confirm, setConfirm] = useState(null);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingPreference, setSavingPreference] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    api("/me/preferences")
      .then((preferences) => {
        if (!active) return;
        setToggles(
          Object.fromEntries(
            Object.entries(preferenceFields).map(([id, field]) => [id, preferences[field]]),
          ),
        );
      })
      .catch((error) => {
        if (active) toast(error.message);
      })
      .finally(() => {
        if (active) setLoadingPreferences(false);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  async function togglePreference(item) {
    const next = { ...toggles, [item.id]: !toggles[item.id] };
    setToggles(next);
    setSavingPreference(item.id);
    try {
      await api("/me/preferences", {
        method: "PATCH",
        body: Object.fromEntries(
          Object.entries(preferenceFields).map(([id, field]) => [field, next[id]]),
        ),
      });
      toast(`${item.label} ${next[item.id] ? "on" : "off"}`);
    } catch (error) {
      setToggles(toggles);
      toast(error.message);
    } finally {
      setSavingPreference(null);
    }
  }

  async function requestAccountDeletion() {
    setConfirm(null);
    setDeleting(true);
    try {
      await api("/me", { method: "DELETE" });
      await signOut();
      toast("Account deletion requested");
      navigate("/login", { replace: true });
    } catch (error) {
      toast(error.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SubPageBar title="Account Settings" fallback="/profile" />

      <PageBody className="px-4 pb-6 pt-3 lg:px-8 lg:py-6">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          {settingsGroups.map((group) => (
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

                  return item.type === "toggle" ? (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-4 ${i ? "border-t border-line" : ""}`}
                    >
                      {inner}
                      <Toggle
                        label={item.label}
                        checked={toggles[item.id]}
                        disabled={loadingPreferences || savingPreference !== null}
                        onChange={() => togglePreference(item)}
                      />
                    </div>
                  ) : (
                    <button
                      key={item.id}
                      onClick={() => toast(`${item.label} is not wired up yet`)}
                      className={rowClass}
                    >
                      {inner}
                      <ChevronRight className="size-5 shrink-0 text-muted" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
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
            disabled={deleting}
            onClick={() => setConfirm("delete")}
            className="w-full rounded-2xl py-3 text-[14px] font-semibold text-muted underline-offset-2 hover:underline disabled:opacity-50"
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
        open={confirm === "delete"}
        title="Delete your account?"
        body="This starts a reviewed deletion request. We will retain only data required for legal, billing, or safety reasons."
        confirmLabel="Request deletion"
        destructive
        onConfirm={requestAccountDeletion}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
