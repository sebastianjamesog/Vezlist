"use client";

import Link from "next/link";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import { SITE_NAME } from "../lib/sites";

function Section({ title, children }) {
  return (
    <section className="rounded-card bg-surface p-5 shadow-card">
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      <div className="mt-2 space-y-2.5 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <>
      <SubPageBar title="Privacy Policy" fallback="/" />
      <PageBody className="space-y-4 px-4 pb-8 pt-3 lg:max-w-3xl lg:px-8 lg:py-6">
        <div role="note" className="rounded-card border-2 border-amber-400 bg-amber-50 p-4 text-[13px] font-semibold text-amber-900">
          Draft privacy notice. This page describes the current implementation, but retention periods,
          hosting locations, subprocessors, contact details, and jurisdiction-specific rights still
          require business and legal review before launch.
        </div>
        <Section title="Information handled by the service">
          <p>{SITE_NAME} sends account registration and sign-in details to the Vezlist API. The API stores account and profile information, ads and their media, saved ads, moderation reports, support tickets and replies, and account preferences when you use those features.</p>
          <p>Public ads and seller profiles can be seen by other visitors. Support tickets are available only to the account owner and authorized staff. Staff actions and security events may be logged by the backend.</p>
        </Section>
        <Section title="Sessions and browser storage">
          <p>Authentication uses a server-managed session cookie, with a separate CSRF token for account-changing requests. Your browser also stores some display preferences and unfinished local activity, such as location, discreet mode, seen statuses, blocked sellers, and draft status content.</p>
          <p>Clearing browser storage removes only that device's local data. It does not delete information already stored by the API. Use account settings to request account deletion or contact support about data held by the service.</p>
        </Section>
        <Section title="External services">
          <p>Listing media is stored in S3-compatible object storage. The map interface loads tiles from an external map provider. The final production hosting, storage, and any additional processors must be documented here before launch.</p>
        </Section>
        <Section title="Retention and your choices">
          <p>Account deletion currently creates a pending request for staff; it does not instantly erase all server records. A final retention schedule and process for access, correction, export, and deletion requests must be approved before production use.</p>
          <p>For help, <Link href="/support/tickets" className="font-semibold text-brand hover:underline">open a support ticket</Link>.</p>
        </Section>
      </PageBody>
    </>
  );
}
