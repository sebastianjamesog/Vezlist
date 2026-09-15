"use client";

import Link from "next/link";
import { useAccount } from "../context/AccountContext";
import { ACCOUNT_ROLES } from "../lib/accountRoles";
import SubPageBar from "./layout/SubPageBar";
import PageBody from "./layout/PageBody";
import Button from "./ui/Button";
import Icon from "./ui/Icon";

/**
 * Gate for a screen only one kind of account has any use for.
 *
 * It does not redirect. A creator screen reached by a browsing account is not
 * an error — it is someone who has found the thing they would need to switch
 * for — so it renders the offer instead of bouncing them somewhere else and
 * leaving them to work out what happened. Deep links and bookmarks survive.
 *
 * Sits inside RequireAuth, never instead of it: this asks what you may do, not
 * whether you are anyone.
 */
export default function RequireCapability({
  capability,
  title,
  children,
  fallback = "/profile",
}) {
  const { can, setRole } = useAccount();
  if (can(capability)) return children;

  const creator = ACCOUNT_ROLES.creator;

  return (
    <>
      <SubPageBar title={title} fallback={fallback} />

      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        <section className="mx-auto max-w-md rounded-card bg-surface p-6 text-center shadow-card lg:p-8">
          <span className="brand-gradient mx-auto grid size-14 place-items-center rounded-3xl text-on-brand">
            <Icon name={creator.icon} className="size-7" strokeWidth={2.2} />
          </span>

          <h2 className="mt-4 text-[20px] font-extrabold text-ink">
            This is a creator screen
          </h2>
          <p className="mx-auto mt-2 max-w-[22rem] text-[14px] leading-relaxed text-muted">
            {creator.blurb} Your account is set to browsing — switch it and{" "}
            {title.toLowerCase()} opens straight away.
          </p>

          <div className="mt-6 space-y-2.5">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setRole("creator")}
            >
              Become an ads creator
            </Button>
            <Link
              href={fallback}
              className="block py-2 text-[14px] font-semibold text-muted hover:text-ink"
            >
              Not now
            </Link>
          </div>
        </section>
      </PageBody>
    </>
  );
}
