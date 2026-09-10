# Module 10: notifications

## API contract

All endpoints are session-authenticated and restricted to the current enabled
account. `site` is required (`MARKETPLACE` or `PERSONALS`); read mutations also
require CSRF. No public endpoint can create notifications or choose a recipient.

| Endpoint | Response |
| --- | --- |
| `GET /api/v1/me/notifications?site=...&limit=24&cursor=...` | `{items, nextCursor}` |
| `GET /api/v1/me/notifications/unread-count?site=...` | `{count}` |
| `POST /api/v1/me/notifications/{id}/read?site=...` | `{count}` |
| `POST /api/v1/me/notifications/read-all?site=...` | `{count}` |

Items have `id`, `type`, `title`, `message`, `href`, `createdAt`, and nullable
`readAt`. `nextCursor` is a nullable positive decimal string: pass it unchanged.
Page size is 1-50. Pages use descending sequence keyset pagination, not offsets.
Cross-account/site read attempts return 404. Read actions are idempotent.

In-app notifications are always enabled. Existing `GET/PATCH /api/v1/me/preferences`
controls optional email (`emailUpdates`) and push (`pushNotifications`) delivery.
These switches do not silence the inbox. Preferences are checked at delivery time.

## Events and delivery

Flyway V12 adds a durable event queue, inbox, and per-channel delivery ledger.
Listing-event inserts enqueue approved/rejected/removed events in the same
transaction with recipient and site snapshots. Saves produce at most one aggregate
notification per listing/UTC day, after a 15-minute collection delay; unsaves do
not notify. The message never identifies people who saved a listing.
An indexed, bounded scan queues expiry reminders for active listings expiring
within 24 hours, deduplicated by listing and expiry timestamp. Old moderation
events from before V12 are intentionally not replayed into a new user's inbox.

Password changes create safe account-security notices in both site inboxes.
`SUPPORT_REPLY` and `PAYMENT_EVENT` are defined for future trusted internal
publishers; their feature modules are not implemented here. No arbitrary external
message, URL, or moderator-private note is copied into notification content.

Workers claim bounded batches with PostgreSQL `FOR UPDATE SKIP LOCKED`. Inbox
creation and event completion commit together; unique keys prevent duplicates.
Failures retry with capped exponential backoff and stop after eight attempts in
`FAILED`. Optional-channel retries cannot roll back an already delivered inbox
notification. Only generic error codes are persisted; no provider response bodies
or secrets are logged. Operators can inspect the queue/ledger and requeue failed
rows after fixing a cause; there is no public retry/admin endpoint.

Email/push use `NotificationChannelProvider`. No external provider is installed:
their ledger entries are `SKIPPED` with `PROVIDER_NOT_CONFIGURED` or
`PREFERENCE_DISABLED`, not falsely marked delivered. Future providers must use
the stable delivery ID as a provider-side idempotency key, enforce timeouts, and
keep sensitive Personals content out of lock-screen/email previews. A provider
must not treat an uncertain network response as proof a message was not sent.

Scheduled workers can be disabled with `vezlist.notifications.worker-enabled=false`.
The default polling interval is five seconds; expiry scans run once per minute.
This module does not enable email or push service credentials or deploy changes.

## Verification commands

From `Backend`, run `mvn -Pintegration verify` for database/API regressions.
Docker is required; tests use disposable Testcontainers databases. The upgrade
test starts with V11 data and checks preservation plus the no-historical-replay
policy. From `Frontend`, run `npm test`, `npm run build:all`, and
`npm run test:browser` for unit, production-build, and mocked-browser coverage.

For live frontend/backend verification, install the frontend dependencies and
Chromium (or use installed Chrome), then run from `Backend`:

```powershell
mvn -Pintegration -Dtest=NotificationBrowserIT test
```

This opt-in harness creates a disposable PostgreSQL database, starts Spring on a
random port, seeds an ephemeral account and two notifications/site through the
event publisher, and starts both Next apps on loopback ports 3200/3201. Chromium
uses real login/session cookies, CSRF middleware, and inbox/read APIs, checking
read-one/read-all persistence after refresh. It never intercepts API responses
or modifies a developer/live database. It tests the inbox journey, not every
upstream event source or external email/push provider. The ordinary backend
suite deliberately does not require Node or a browser; the `IT` class runs only
when explicitly selected.

Verified locally on September 11, 2026: the full backend regression build passed
63 tests (including 14 notification integration tests and the V11 upgrade), and
the live browser harness passed both Marketplace and Personals inbox journeys.
The live run exposed and fixed a login hydration timing bug: login fields now
remain disabled until the session bootstrap is ready. The harness checks actual
database read state after both browser scenarios and stops its owned test servers.
After the login fix, all 77 frontend unit tests, 24 mocked-API browser tests, and
both production frontend builds passed. The two live browser scenarios are
additional to those 24 mocked tests. No deployment or external email/push delivery
was performed.
