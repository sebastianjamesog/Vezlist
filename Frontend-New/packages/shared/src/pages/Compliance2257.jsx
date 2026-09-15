"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";

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
        Draft — pending legal review, and this one carries a genuine blocker:
        this build has no age- or identity-verification system behind its 18+
        gate. This page names what a real 2257 statement has to cover; it does
        not claim compliance the app does not have. Sections marked{" "}
        <strong>TODO</strong> need a real custodian, a real address and a real
        verification process before this site can carry explicit content in
        production.
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

export default function Compliance2257() {
  return (
    <>
      <SubPageBar title="18 U.S.C. 2257 Statement" fallback="/" />

      <PageBody className="space-y-4 px-4 pb-8 pt-3 lg:max-w-3xl lg:px-8 lg:py-6">
        <DraftBanner />

        <p className="text-[14px] leading-relaxed text-muted">
          18 U.S.C. §2257 (and §2257A) require anyone who produces sexually
          explicit visual content to keep, and disclose the custodian of,
          records proving every person depicted was 18 or older when the content
          was made. A platform that hosts member-submitted explicit content, as
          Personals does, typically needs its own compliance statement even
          where it did not produce the content itself. This page is that
          statement's skeleton.
        </p>

        <Section id="scope" title="1. What this covers">
          <p>
            Personals is a members' board: ads and stories are written and
            uploaded by the people who post them, and some of it is explicit.
            Every visit to the site is preceded by an 18+ confirmation.
          </p>
          <Todo>
            confirm with counsel whether §2257's producer obligations, or the
            (lighter) secondary-producer / platform obligations, apply here, and
            to which categories of content specifically.
          </Todo>
        </Section>

        <Section id="verification" title="2. How age is verified today">
          <p>
            It currently is not. The 18+ screen every visitor sees is a
            self-attestation with a button, checked against nothing: no ID is
            collected, no date of birth is asked for, and nothing about that
            confirmation is stored anywhere — it lives only in the page's
            in-memory state for that visit and is gone on the next.
          </p>
          <p>
            The same is true for anyone posting content: the sign-up form asks
            for a name, an email and a password, and nothing that establishes
            the poster's real identity or age.
          </p>
          <Todo>
            this is the actual compliance blocker. Before this build carries
            real explicit content, it needs an ID-verification step for posters
            (and arguably for viewers, depending on jurisdiction), plus a real
            records system behind it — not just this page.
          </Todo>
        </Section>

        <Section id="custodian" title="3. Custodian of records">
          <Todo>
            name a real Custodian of Records and a real physical address — this
            is a legal requirement, not a placeholder that can be invented here.
            §2257 records must be available for inspection at the address on
            file.
          </Todo>
        </Section>

        <Section id="records" title="4. What records are kept, and where">
          <Todo>
            describe the actual records system once one exists: what is captured
            per submission, how long it is retained, and how it is secured.
            There is nothing to describe today — see §2.
          </Todo>
        </Section>

        <Section id="removal" title="5. Requesting removal">
          <p>
            If you believe content depicting you is on this site without your
            consent, or you are a minor depicted in content on this site,
            contact us through{" "}
            <Link
              href="/support"
              className="font-semibold text-brand hover:underline"
            >
              Support
            </Link>{" "}
            — every ticket there is treated as urgent regardless of category —
            or see the{" "}
            <Link
              href="/dmca"
              className="font-semibold text-brand hover:underline"
            >
              DMCA notice
            </Link>{" "}
            page if the concern is about copyright rather than consent.
          </p>
          <Todo>
            add a dedicated, expedited removal-request channel and a stated
            response-time commitment once the business defines one.
          </Todo>
        </Section>

        <Section id="contact" title="6. Contact">
          <Todo>
            add a dedicated 2257 compliance contact once a custodian is named —
            until then, requests should route through{" "}
            <Link
              href="/support"
              className="font-semibold text-brand hover:underline"
            >
              Support
            </Link>
            .
          </Todo>
        </Section>

        <p className="text-[13px] text-muted">
          See also{" "}
          <Link
            href="/terms"
            className="font-semibold text-brand hover:underline"
          >
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/privacy"
            className="font-semibold text-brand hover:underline"
          >
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link
            href="/dmca"
            className="font-semibold text-brand hover:underline"
          >
            DMCA notice
          </Link>
          .
        </p>
      </PageBody>
    </>
  );
}
