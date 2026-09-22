"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { IS_PERSONALS, SITE_NAME } from "../lib/sites";

function DraftBanner() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-card border-2 border-amber-400 bg-amber-50 p-4 text-amber-900"
    >
      <TriangleAlert
        aria-hidden="true"
        className="size-5 shrink-0 text-amber-600"
        strokeWidth={2.2}
      />
      <p className="text-[13px] font-semibold leading-relaxed">
        Draft — pending legal review. The data-handling claims below are
        verified against this build's source rather than invented, but the page
        has not been reviewed by counsel and is not yet a binding policy.
        Sections marked <strong>TODO</strong> need a decision from counsel or
        the business before this page can go live.
      </p>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="rounded-card bg-surface p-5 shadow-card"
    >
      <h2 id={`${id}-h`} className="text-[16px] font-bold text-ink">
        {title}
      </h2>
      <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

function Todo({ children }) {
  return (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
      TODO: {children}
    </p>
  );
}

const ROW = "border-t border-line";
const CELL = "px-3 py-2 align-top";

/** One row per storage key, name and purpose taken straight from the source
 * file that owns the key. */
function StoreRow({ name, kind, purpose, life }) {
  return (
    <tr className={ROW}>
      <td className={`${CELL} font-mono text-[12px] text-ink`}>{name}</td>
      <td className={`${CELL} text-[12px] text-muted`}>{kind}</td>
      <td className={`${CELL} text-[13px] text-ink`}>{purpose}</td>
      <td className={`${CELL} text-[12px] text-muted`}>{life}</td>
    </tr>
  );
}

export default function Privacy() {
  return (
    <>
      <SubPageBar title="Privacy Policy" fallback="/" />

      <PageBody className="space-y-4 px-4 pb-8 pt-3 lg:max-w-3xl lg:px-8 lg:py-6">
        <DraftBanner />

        <p className="text-[14px] leading-relaxed text-muted">
          This page describes what {SITE_NAME} actually stores about you in this
          build, and why. Everything below was checked against the source rather
          than written from a template — where something cannot be verified from
          the code, it is marked TODO rather than guessed at.
        </p>

        <Section id="collect" title="1. What we collect">
          <p>
            There is no backend behind this build — nothing you enter is sent to
            a server. What exists instead is data your browser keeps for itself,
            written directly by the feature you used it for:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The name, email and role you give the sign-up form, and the email
              you use to sign in.
            </li>
            <li>Ads you save, and which status posts you've seen.</li>
            <li>
              Listings, support tickets and reports you create — this build has
              no server, so these are your own local record of them, not a copy
              held anywhere else.
            </li>
            <li>Your chosen language and applied location filter.</li>
            <li>
              Notification and contact-reveal toggles you set in Settings.
            </li>
            {IS_PERSONALS && (
              <li>Whether Discreet mode (photo blurring) is switched on.</li>
            )}
          </ul>
          <Todo>
            once a real backend exists, this section has to describe what is
            actually sent to and held on a server, including anything collected
            at signup (IP address, device data) that this client-only build does
            not have.
          </Todo>
        </Section>

        <Section id="how" title="2. How it's stored">
          <p>Two mechanisms, both in your browser and neither on a server:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>A shared cookie.</strong> vezlist.cc and
              personals.vezlist.cc are one product with two front doors, so your
              session, language and location are kept in a cookie set on
              the shared parent domain rather than per-site storage — otherwise
              signing out of one site would leave you signed in on the other. It
              is not marked <code>httpOnly</code>: there is no server to issue a
              real session token, so this is a record of who you said you are,
              readable by this site's own scripts, and not a credential. It is
              marked <code>secure</code> in production and{" "}
              <code>samesite=lax</code> always.
            </li>
            <li>
              <strong>localStorage.</strong> Saved ads, seen statuses, listings,
              tickets, reports and settings toggles are per-site and larger than
              a cookie should carry, so they live in localStorage instead.
            </li>
          </ul>
          <Todo>
            once real accounts exist, session issuance and storage need to move
            server-side (an httpOnly cookie or equivalent) — the current cookie
            is explicitly not a secure credential.
          </Todo>
        </Section>

        <Section id="table" title="3. Every cookie and local storage key">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr>
                  <th
                    className={`${CELL} text-[11px] font-bold uppercase tracking-wide text-muted`}
                  >
                    Key
                  </th>
                  <th
                    className={`${CELL} text-[11px] font-bold uppercase tracking-wide text-muted`}
                  >
                    Where
                  </th>
                  <th
                    className={`${CELL} text-[11px] font-bold uppercase tracking-wide text-muted`}
                  >
                    Purpose
                  </th>
                  <th
                    className={`${CELL} text-[11px] font-bold uppercase tracking-wide text-muted`}
                  >
                    Lifetime
                  </th>
                </tr>
              </thead>
              <tbody>
                <StoreRow
                  name="vezlist_session"
                  kind="Cookie (shared)"
                  purpose="Signed-in session — name, email, avatar, role"
                  life="30 days, or until sign-out"
                />
                <StoreRow
                  name="vezlist_location"
                  kind="Cookie (shared)"
                  purpose="Applied province/city filter"
                  life="30 days"
                />
                <StoreRow
                  name="vezlist:saved:v1"
                  kind="localStorage"
                  purpose="Ad ids you've saved"
                  life="Until cleared"
                />
                <StoreRow
                  name="vezlist:status-seen:v1"
                  kind="localStorage"
                  purpose="Status posts you've already seen"
                  life="Until cleared"
                />
                <StoreRow
                  name="vezlist:ads:v1"
                  kind="localStorage"
                  purpose="Listings you've drafted or published"
                  life="Until cleared"
                />
                <StoreRow
                  name="vezlist:tickets:v1"
                  kind="localStorage"
                  purpose="Support tickets you've opened"
                  life="Until cleared"
                />
                <StoreRow
                  name="vezlist:reports:v1"
                  kind="localStorage"
                  purpose="Sellers you've blocked or reported"
                  life="Until cleared"
                />
                <StoreRow
                  name="vezlist:settings-toggles"
                  kind="localStorage"
                  purpose="Notification and contact-reveal preferences"
                  life="Until cleared"
                />
                <StoreRow
                  name="vezlist:reveals:v1"
                  kind="localStorage"
                  purpose="Which ads you've chosen to reveal contact info for"
                  life="Until cleared"
                />
                {IS_PERSONALS && (
                  <StoreRow
                    name="vezlist:discreet"
                    kind="localStorage"
                    purpose="Discreet (photo-blur) mode on/off"
                    life="Until cleared"
                  />
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-muted">
            The age gate on this site (personals only) is the one exception: it
            asks every visit and remembers nothing — see the{" "}
            {IS_PERSONALS ? (
              <Link
                href="/2257"
                className="font-semibold text-brand hover:underline"
              >
                2257 page
              </Link>
            ) : (
              "2257 page"
            )}{" "}
            for why.
          </p>
        </Section>

        <Section id="cookie-banner" title="4. Why there's no cookie banner">
          <p>
            Every item above exists to run a feature you asked for — staying
            signed in across both sites, remembering what you saved, your
            language, your settings. None of it
            is advertising, analytics or cross-site tracking, and this build has
            no analytics script, ad pixel or third-party tracker of any kind —
            that was checked against the source, not assumed. Cookies and
            storage used strictly to provide a feature you requested don't
            require consent under the ePrivacy Directive's "strictly necessary"
            exemption, so we haven't added a consent banner that would only be
            performing consent nobody needs to give.
          </p>
          <Todo>
            revisit this the moment analytics, advertising or any third-party
            tracker is added — that would need a real consent mechanism before
            it loads, not this page rewritten after the fact. Have counsel
            confirm the "strictly necessary" read above before this ships for
            real.
          </Todo>
        </Section>

        <Section id="third-parties" title="5. Third parties">
          <p>
            The Nearby / map screen loads its map tiles from CARTO's CDN
            (basemaps.cartocdn.com), attributed to OpenStreetMap contributors.
            Opening that screen sends your IP address to that CDN the way
            loading any embedded map image would — this build does not proxy or
            cache tiles itself.
          </p>
          <p>Nothing else in this build calls out to a third party.</p>
          <Todo>
            confirm with a network trace whether CARTO's tile responses set any
            cookies of their own, and list any payment processor,
            identity-verification vendor or analytics tool here the moment one
            is integrated.
          </Todo>
        </Section>

        <Section id="retention" title="6. Retention">
          <p>
            Cookies expire after 30 days or on sign-out. localStorage has no
            expiry — it holds what you put there until you clear your browser's
            site data or use the app's own delete controls.
          </p>
          <Todo>
            define real retention limits for anything held on a server, once
            there is a server.
          </Todo>
        </Section>

        <Section id="rights" title="7. Your rights">
          <p>
            Because everything today lives in your own browser, exporting or
            deleting it is already available: clearing your browser's site data
            for vezlist.cc / personals.vezlist.cc removes all of it, and account
            deletion in Settings clears it too.
          </p>
          <Todo>
            build a real data export/delete flow (GDPR/CCPA-style) once a
            backend holds real user data — a "clear your browser" answer stops
            being adequate the moment there's a server copy too. This is the
            acceptance criterion the issue calls out explicitly.
          </Todo>
        </Section>

        <Section id="age" title="8. Age">
          {IS_PERSONALS ? (
            <>
              <p>
                Every visit opens behind an 18+ confirmation. It is a
                self-attestation — no ID is collected or checked, and the
                confirmation is kept only in memory for that page load, not
                stored. See the{" "}
                <Link
                  href="/2257"
                  className="font-semibold text-brand hover:underline"
                >
                  2257 page
                </Link>{" "}
                for the record-keeping question this raises.
              </p>
            </>
          ) : (
            <Todo>
              state a minimum age for this site; none is enforced today.
            </Todo>
          )}
        </Section>

        <Section id="security" title="9. Security">
          <Todo>
            describe real security practices once there is a server to secure.
            Today's cookie is explicitly not httpOnly and not a credential — see
            section 2.
          </Todo>
        </Section>

        <Section id="jurisdiction" title="10. Jurisdiction">
          <Todo>
            confirm the operating entity and governing jurisdiction with counsel
            (see Terms §8) — this section should match that answer.
          </Todo>
        </Section>

        <Section id="contact" title="11. Contact">
          <p>
            Reach the team through{" "}
            <Link
              href="/support"
              className="font-semibold text-brand hover:underline"
            >
              Support
            </Link>{" "}
            or{" "}
            <a
              href="mailto:support@vezlist.cc"
              className="font-semibold text-brand hover:underline"
            >
              support@vezlist.cc
            </a>
            .
          </p>
          <Todo>add a dedicated privacy contact address once one exists.</Todo>
        </Section>

        <p className="text-[13px] text-muted">
          See also{" "}
          <Link
            href="/terms"
            className="font-semibold text-brand hover:underline"
          >
            Terms of Service
          </Link>
          {IS_PERSONALS && (
            <>
              ,{" "}
              <Link
                href="/2257"
                className="font-semibold text-brand hover:underline"
              >
                18 U.S.C. 2257 statement
              </Link>{" "}
              and{" "}
              <Link
                href="/dmca"
                className="font-semibold text-brand hover:underline"
              >
                DMCA notice
              </Link>
            </>
          )}
          .
        </p>
      </PageBody>
    </>
  );
}
