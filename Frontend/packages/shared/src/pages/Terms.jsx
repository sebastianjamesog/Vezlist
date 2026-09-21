"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { IS_PERSONALS, SITE_NAME } from "../lib/sites";

/**
 * Sits above every legal page this build ships. Nothing behind it has been
 * reviewed by counsel or agreed to by the business — it is a structural draft
 * so the routes, the headings a reviewer needs and the in-app links exist
 * ahead of that review, not a substitute for it. See Privacy.jsx,
 * Compliance2257.jsx and Dmca.jsx for the same banner.
 */
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
        Draft — pending legal review. This page describes what the app actually
        does today; it is not a reviewed or binding agreement, and nothing on it
        should be relied on as legal advice. Sections marked{" "}
        <strong>TODO</strong> need a decision from counsel or the business
        before this page can go live.
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

export default function Terms() {
  return (
    <>
      <SubPageBar title="Terms of Service" fallback="/" />

      <PageBody className="space-y-4 px-4 pb-8 pt-3 lg:max-w-3xl lg:px-8 lg:py-6">
        <DraftBanner />

        <p className="text-[14px] leading-relaxed text-muted">
          These terms cover use of {SITE_NAME}
          {IS_PERSONALS ? ", the adults-only personals board" : ""}. Creating an
          account or posting a listing means you accept them once they are
          finished and published; until then, treat this page as a preview of
          what they will cover.
        </p>

        <Section id="eligibility" title="1. Eligibility">
          {IS_PERSONALS ? (
            <>
              <p>
                This site is adults-only. Every visit opens behind an age gate
                that asks you to confirm you are 18 or older, or the age of
                majority where you live if that is higher, before showing any
                content.
              </p>
              <Todo>
                the age gate is a self-attestation with no identity or age
                verification behind it (see the 2257 page) — confirm with
                counsel whether that is sufficient for this jurisdiction or
                whether ID verification is required before this ships for real.
              </Todo>
            </>
          ) : (
            <Todo>
              set and state a minimum age for creating an account. The product
              has no age gate today.
            </Todo>
          )}
        </Section>

        <Section id="account" title="2. Your account">
          <p>
            An account is created from the sign-up form and stored as a session
            in a cookie shared by vezlist.cc and personals.vezlist.cc, so one
            account covers both. There is no backend behind this build: nothing
            you enter is verified against a real identity, and no password is
            actually checked against a stored credential. Signing in is a record
            of who you said you are, kept only in your browser.
          </p>
          <Todo>
            once a real backend exists, this section needs to describe actual
            authentication, verification and password-handling practices.
          </Todo>
        </Section>

        <Section id="conduct" title="3. Acceptable use">
          <p>
            {IS_PERSONALS
              ? "Personals carries ads and stories posted by members, some of it explicit. Posting is restricted to adults, and content is expected to be legal for an adult audience in the jurisdictions it is served."
              : `${SITE_NAME} is a classifieds board for buying, selling and hiring. Listings are expected to be for real items or services and to comply with applicable law.`}
          </p>
          <Todo>
            write the actual prohibited-content and prohibited-conduct list
            (this needs a business decision, not an engineering one — it
            determines what moderation enforces).
          </Todo>
        </Section>

        <Section id="content" title="4. Content you post">
          <Todo>
            decide and state what licence a poster grants the platform to store,
            display and (if applicable) moderate their content, and who owns it.
          </Todo>
        </Section>

        <Section id="payments" title="5. Credits and payments">
          <p>
            The app has a credits wallet used to promote listings. In this build
            it is a simulated balance stored in the same shared session cookie —
            no card is charged and no payment processor is connected.
          </p>
          <Todo>
            write real payment terms (refunds, chargebacks, pricing) once a
            payment processor is integrated.
          </Todo>
        </Section>

        <Section id="moderation" title="6. Moderation and enforcement">
          <Todo>
            describe how reports are handled and what enforcement looks like
            (warnings, listing removal, suspension). An admin moderation console
            exists in this codebase; this page should describe the policy it
            enforces, not just link to the tool.
          </Todo>
        </Section>

        <Section id="disclaimers" title="7. Disclaimers and liability">
          <Todo>
            standard disclaimer and limitation-of-liability language — this must
            come from counsel, not be drafted here.
          </Todo>
        </Section>

        <Section id="law" title="8. Governing law">
          <p>
            The product is built for a Canadian audience — prices are shown in
            Canadian dollars and the default locale is en-CA.
          </p>
          <Todo>
            confirm the operating entity and the governing jurisdiction with
            counsel; do not infer a legal jurisdiction from a currency default.
          </Todo>
        </Section>

        <Section id="changes" title="9. Changes to these terms">
          <p>
            Once this page is real, material changes will be dated on this page
            and, where required, announced before they take effect.
          </p>
        </Section>

        <Section id="contact" title="10. Contact">
          <p>
            Reach the team through{" "}
            <Link
              href="/support"
              className="font-semibold text-brand hover:underline"
            >
              Support
            </Link>{" "}
            or by email at{" "}
            <a
              href="mailto:support@vezlist.cc"
              className="font-semibold text-brand hover:underline"
            >
              support@vezlist.cc
            </a>
            .
          </p>
          <Todo>
            add a dedicated legal contact address once one exists —
            support@vezlist.cc is the one verified contact channel in this build
            (see contactChannels in data/mock.js).
          </Todo>
        </Section>

        <p className="text-[13px] text-muted">
          See also{" "}
          <Link
            href="/privacy"
            className="font-semibold text-brand hover:underline"
          >
            Privacy Policy
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
