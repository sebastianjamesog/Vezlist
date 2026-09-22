# Module 9: moderation and safety

Since V16, new regular ads publish directly on both sites after ownership, catalog,
and image-processing checks. `POST /listings/{id}/submit` accepts optional
`{requestVerification:true}` to keep the ad private for code/photo verification;
staff verification approval publishes it with its badge. These ads use the separate
verification queue and do not also create an ordinary submission case. Rejection
keeps them private, and an ordinary moderation approval cannot bypass verification.

Existing pending submissions are not auto-published. Their original policy remains
`marketplace-v1` (one independent reviewer) or `personals-v1` (two independent
reviewers), as does the policy for eligible appeals. Personals moderation reviewers
record eligibility and consent checks. Automated age verification and a third-party
content scanner are not configured. Post-publication reporting and removal still apply.

## Public and owner flows

All mutations require the existing session and CSRF header. `site` is always
`MARKETPLACE` or `PERSONALS`.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/v1/listings/{id}/reports` | Body `{site, reason, details?}`. Another user's active, unexpired listing only. Returns `{id}`. |
| `GET /api/v1/me/listings/{id}/moderation?site=...` | Owner-only `{listingId, status, publicReason, appealAllowed}`. |
| `POST /api/v1/me/listings/{id}/moderation/appeals` | Body `{site, message}`. Opens a review of a rejected/removed listing and returns `{id}`. |

Report reasons: `SPAM`, `FRAUD`, `PROHIBITED`, `SAFETY`, `OTHER`. Details are limited
to 1,000 characters. There is one report per account/listing; retries return the
original receipt. Quotas are five new reports/hour and twenty/day/account,
serialized through a database row lock across all API instances. A report does
not automatically remove a listing.

Appeals accept 1–2,000 characters. They are idempotent for the same listing review
version and limited to five new appeal cases/day/account. Rejected listings can
also be corrected and resubmitted. Removed listings can only return through staff
review of an appeal. A new submission closes the previous open case and discards
its approvals by starting a new case; historical actions remain intact.

The shared Ad Detail page supplies the reporting form; My Ads shows review
details and the appeal form. Private reports, reporter identities, reviewer
identities, and internal notes are never part of the owner response. Reasons are
selected from fixed public messages rather than copied from moderator notes.

## Staff workflow

The `/api/v1/moderation/**` namespace requires MODERATOR or ADMIN. Service methods
also check the current database role and account status, so revoked privileges
cannot persist through an old session. Provision staff roles through trusted
operator administration; this module does not provide a public role-grant route
or create a default administrator.

1. `GET /api/v1/moderation/cases?site=MARKETPLACE&limit=24&offset=0` lists open
   cases in creation order. Page size is 1–50; offset is 0–10,000.
2. `GET /api/v1/moderation/cases/{caseId}` returns the current listing content,
   policy, up to six media items, and the most recent 100 actions/first 100
   reports. READY media receives short-lived delivery URLs. Operational history
   beyond these bounded detail lists remains in the audit tables.
3. `POST .../{caseId}/assignment` with `{assigneeId}` claims the case. Moderators
   can claim unassigned cases for themselves; administrators can reassign cases.
   Nobody can claim, assign to themselves, or decide their own listing.
4. `POST .../{caseId}/notes` with `{message}` records a private note (2,000 chars).
5. `POST .../{caseId}/media-reviews` with `{mediaId, verdict, note?}` records a
   human `PASS` or `BLOCK` verdict tied to the current image checksum. Every
   approving reviewer must PASS every current image. Any current BLOCK prevents
   approval; uploads still processing or rejected also prevent approval. Image
   byte/type/checksum processing from Module 5 is a prerequisite, not a substitute
   for this content review. Reviewers cannot revise evidence after voting.
6. `POST .../{caseId}/decisions` with `{decision, reason?, note?, eligibilityChecked?}`
   records `APPROVE`, `REJECT`, `REMOVE`, or `DISMISS`. A claim is required. APPROVE
   is for pending submissions/appeals, REJECT for pending submissions/appeals,
   REMOVE for active listings, DISMISS for report cases on active listings.

For Personals the first approval releases the claim. A different reviewer must
claim the case, review its images, attest eligibility/consent, and approve. Each
reviewer has at most one approval per case. The first vote does not publish a
listing. Current media evidence is checked again before final publication.

REJECT and REMOVE require one of `MISLEADING_CONTENT`, `PROHIBITED_CONTENT`,
`UNSAFE_CONTENT`, `MEDIA_REQUIRES_CHANGES`, `ELIGIBILITY_NOT_CONFIRMED`, or
`DUPLICATE_OR_SPAM`. Replies expose the corresponding fixed public explanation.
Approval publishes the listing for 30 days. Subsequent removal makes it
inaccessible through public listing/discovery/seller/saved flows. Signed media
URLs already issued can remain usable until their existing expiry.

There is no dedicated staff dashboard in this module; staff operations are API
endpoints (also visible through Swagger). Notifications are durable outbox events
for Module 10, not delivered emails or push messages.

## Persistence and verification

Flyway V11 creates reports, cases, actions, audit events, and image reviews. A
submission trigger originally queued all PENDING_REVIEW listings. V16 excludes
verification-requested submissions, preserves existing rows, and adds the direct
publication event. Case changes, listing transitions, immutable actions, audit
entries, and listing outbox events commit or roll back together. PostgreSQL
triggers reject UPDATE/DELETE of action/audit history; no API mutates that history.
Hard deletion/retention work must explicitly account for this audit policy.

Content changes invalidate a review version; save-count metadata alone does not.
History stores policy-relevant decision evidence, identifiers, and bounded notes.
Staff access and ownership checks apply independently of the frontend.

Run `mvn -Pintegration verify` for the database/security tests. The moderation
suite exercises role boundaries, CSRF, self-review denial, media gates, double
review, reporting quotas under concurrency, safe reasons, appeals, removal,
immutable history, input validation, and rollback on an outbox write failure.
Frontend unit tests and browser smoke tests cover the shared forms; browser
smoke tests intercept API calls and do not exercise a live backend deployment.

Verified on September 11, 2026:

- Backend `mvn -Pintegration verify`: 49 tests passed, including 12 moderation
  integration tests and a V10-to-V11 upgrade preserving an existing submission.
- Frontend `npm test`: 66 tests passed.
- Frontend `npm run test:browser`: 12 Chromium smoke tests passed across both sites
  with mocked API responses.
- Marketplace and Personals production builds passed.

This is local automated verification, not a deployment or a live full-stack
browser acceptance test. The next planned module is Module 10 (Notifications).
