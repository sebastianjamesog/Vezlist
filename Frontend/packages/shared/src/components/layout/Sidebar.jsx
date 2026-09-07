"use client";

import { useState } from "react";
import Link from "next/link";
import { NavLink, useNavigate } from "../../lib/nav";
import { LogOut } from "lucide-react";
import Wordmark from "./Wordmark";
import Button from "../ui/Button";
import { navItems } from "./navItems";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { profile } from "../../data/mock";

const ROW =
  "flex items-center gap-4 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors xl:pr-5";

/**
 * Desktop rail: icon-only from lg, labels from xl — the same collapse
 * Instagram's web sidebar does on narrower desktops.
 */
export default function Sidebar({ onPostAd, credits = 100 }) {
  const toast = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <aside className="hidden w-[92px] shrink-0 flex-col border-r border-line bg-surface px-3 py-6 lg:flex xl:w-[264px] xl:px-4">
      <Link href="/" aria-label="Home" className="mb-8 px-1 xl:px-2">
        <span className="hidden xl:block">
          <Wordmark size="lg" />
        </span>
        <span className="xl:hidden">
          <Wordmark markOnly />
        </span>
      </Link>

      <nav className="space-y-1">
        {navItems.map((item) =>
          item.action === "create" ? (
            <button
              key={item.id}
              onClick={onPostAd}
              title="Create"
              className={`${ROW} w-full text-ink hover:bg-canvas`}
            >
              <item.Icon className="size-6 shrink-0" strokeWidth={2} />
              <span className="hidden xl:inline">{item.label}</span>
            </button>
          ) : (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              title={item.label}
              className={({ isActive }) =>
                `${ROW} ${isActive ? "bg-brand-soft text-brand" : "text-ink hover:bg-canvas"}`
              }
            >
              {({ isActive }) => (
                <>
                  {item.avatar ? (
                    <img
                      src={user?.avatar ?? profile.avatar}
                      alt=""
                      className={`size-6 shrink-0 rounded-full object-cover ring-2 ${
                        isActive ? "ring-brand" : "ring-transparent"
                      }`}
                    />
                  ) : (
                    <item.Icon
                      className="size-6 shrink-0"
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                  )}
                  <span className="hidden xl:inline">{item.label}</span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>

      <div className="mt-6 hidden xl:block">
        <Button size="lg" className="w-full" onClick={onPostAd}>
          Post an ad
        </Button>
      </div>

      <div className="mt-auto space-y-1 pt-6">
        <Link
          href="/profile"
          title={`${credits} credits`}
          className={`${ROW} text-ink hover:bg-canvas`}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-brand-soft text-[12px] font-bold tabular-nums text-brand">
            {credits}
          </span>
          <span className="hidden xl:inline">Credits</span>
        </Link>

        <button
          onClick={() => setConfirmLogout(true)}
          title="Log out"
          className={`${ROW} w-full text-danger hover:bg-danger-soft`}
        >
          <LogOut className="size-6 shrink-0 rotate-180" strokeWidth={2} />
          <span className="hidden xl:inline">Log out</span>
        </button>
      </div>

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
    </aside>
  );
}
