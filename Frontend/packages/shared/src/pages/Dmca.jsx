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
        Draft — pending legal review. No agent has been registered with the U.S.
        Copyright Office yet, so nothing on this page is a working DMCA
        safe-harbor designation. Sections marked <strong>TODO</strong> need that
        registration, and the business decisions around it, before this page is
        real.
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

export default function Dmca() {
  return (
    <>
      <SubPageBar title="DMCA Notice & Takedown" fallback="/" />

      <PageBody className="space-y-4 px-4 pb-8 pt-3 lg:max-w-3xl lg:px-8 lg:py-6">
        <DraftBanner />

        <p className="text-[14px] leading-relaxed text-muted">
          The Digital Millennium Copyright Act gives a site that hosts
          user-submitted content a safe harbor from copyright liability if it
          designates an agent to receive infringement notices and acts on valid
          ones. This page is that process's skeleton.
        </p>

        <Section id="agent" title="1. Designated agent">
          <Todo>
            register a designated agent with the U.S. Copyright Office's online
            directory and publish that agent's name, address, phone and email
            here — the registration and this page have to match. Nothing here is
            a substitute for that filing.
          </Todo>
        </Section>

        <Section id="notice" title="2. Filing a takedown notice">
          <p>A valid notice under 17 U.S.C. §512(c)(3) needs, in writing:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              A physical or electronic signature of the copyright owner or
              someone authorized to act for them.
            </li>
            <li>
              Identification of the copyrighted work claimed to be infringed.
            </li>
            <li>
              Identification of the material claimed to be infringing, and
              information reasonably sufficient to locate it — a direct link to
              the ad, status post or profile.
            </li>
            <li>Contact information: address, phone number and email.</li>
            <li>
              A statement that the complainant has a good-faith belief the use
              is not authorized by the copyright owner, its agent, or the law.
            </li>
            <li>
              A statement, under penalty of perjury, that the notice is accurate
              and the complainant is authorized to act for the copyright owner.
            </li>
          </ul>
          <p>
            Until a designated agent is registered, send notices through{" "}
            <Link
              href="/support"
              className="font-semibold text-brand hover:underline"
            >
              Support
            </Link>{" "}
            — that ticket system exists and is monitored today, unlike an
            unregistered agent inbox would be.
          </p>
        </Section>

        <Section id="counter" title="3. Counter-notification">
          <p>
            If content of yours was removed and you believe that was a mistake
            or misidentification, 17 U.S.C. §512(g) gives you the right to file
            a counter-notice with the same elements as above, plus a statement
            under penalty of perjury that you have a good-faith belief the
            material was removed in error, and consent to the jurisdiction of a
            federal court.
          </p>
          <Todo>
            define the actual counter-notice process and restoration timeline
            once there is a real takedown workflow to attach it to.
          </Todo>
        </Section>

        <Section id="repeat" title="4. Repeat infringers">
          <Todo>
            state and enforce a repeat-infringer policy — required for safe
            harbor, and currently undefined. The admin moderation console in
            this codebase can enforce one once it is written.
          </Todo>
        </Section>

        <Section id="misrepresentation" title="5. Misrepresentation">
          <p>
            17 U.S.C. §512(f) makes anyone who knowingly and materially
            misrepresents that content is infringing (or was removed by mistake)
            liable for the resulting damages, including legal costs. File
            notices in good faith.
          </p>
        </Section>

        <Section id="contact" title="6. Contact">
          <p>
            Until an agent is registered, route notices and counter-notices
            through{" "}
            <Link
              href="/support"
              className="font-semibold text-brand hover:underline"
            >
              Support
            </Link>
            .
          </p>
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
            href="/2257"
            className="font-semibold text-brand hover:underline"
          >
            18 U.S.C. 2257 statement
          </Link>
          .
        </p>
      </PageBody>
    </>
  );
}
