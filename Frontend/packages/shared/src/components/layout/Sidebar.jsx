"use client";

import { useState } from "react";
import Link from "next/link";
import { NavLink, useNavigate } from "../../lib/nav";
import { LogOut } from "lucide-react";
import Wordmark from "./Wordmark";
import Button from "../ui/Button";
import { navItemsFor } from "./navItems";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { useAccount } from "../../context/AccountContext";
import MediaImage from "../media/MediaImage.jsx";

const ROW =
  "flex items-center gap-4 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors xl:pr-5";

/**
 * Desktop rail: icon-only from lg, labels from xl — the same collapse
 * Instagram's web sidebar does on narrower desktops.
 */
export default function Sidebar({ onCreate, onPostAd, navPreset }) {
  const toast = useToast();
  const { user, signOut } = useAuth();
  const { role } = useAccount();
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
        {navItemsFor(navPreset, role).map((item) =>
          item.action === "create" ? (
            <button
              key={item.id}
              onClick={onCreate}
              title="Create"
              className={`${ROW} w-full text-ink hover:bg-canvas`}
            >
              <item.Icon className="size-6 shrink-0" strokeWidth={2} />
              <span className="hidden xl:inline">{item.label}</span>
            </button>
          ) : item.href ? (
            <a
              key={item.id}
              href={item.href}
              title={item.label}
              className={`${ROW} text-ink hover:bg-canvas`}
            >
              <item.Icon className="size-6 shrink-0" strokeWidth={2} />
              <span className="hidden xl:inline">{item.label}</span>
            </a>
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
                    user?.avatar ? <MediaImage
                      src={user.avatar}
                      alt=""
                      width={24}
                      height={24}
                      className={`size-6 shrink-0 rounded-full object-cover ring-2 ${
                        isActive ? "ring-brand" : "ring-transparent"
                      }`}
                    /> : <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{user?.name?.charAt(0) || "?"}</span>
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

      {/* The rail's one big button. It used to be hidden from a browsing
          account, mirroring the nav table's old habit of hiding Create from
          one; both have stopped, and for the same reason. The refusal now
          happens on the click and says which account type posts and where to
          change it, so the account that cannot publish learns that in a
          sentence instead of by noticing an absence. Nobody loses an evening to
          a four-step form either way — the gate is in front of the form, not
          behind it.

          It goes to `onPostAd` and not `onCreate` because it is labelled "Post
          an ad" and that is what it must do. The chooser belongs to the plus,
          which does not say what it will open; a button that names one thing
          and offers three is a button that lied. */}
      <div className="mt-6 hidden xl:block">
        <Button size="lg" className="w-full" onClick={onPostAd}>
          Post an ad
        </Button>
      </div>

      <div className="mt-auto space-y-1 pt-6">
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
