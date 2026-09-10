# Vezlist Backend Plan

## 1. Purpose and current state

Vezlist currently has two Next.js frontend applications:

- **Marketplace** (`vezlist.cc`) for regular classified listings.
- **Personals** (`personals.vezlist.cc`) for age-gated personal listings and status updates.

They share UI code in `Frontend/packages/shared`. The frontend is presently a prototype: pages read static data from `packages/shared/src/data/mock.js`, while login, saved ads, watched statuses, forms, payment cards, ticket replies, and settings are kept only in React state or browser storage.

The backend should replace those mocks with durable, secure, API-backed data without changing the product's two-site experience.

## 2. Architecture decision

### Choose a modular monolith first

Build **one Java Spring Boot application** with explicitly separated domain modules and one PostgreSQL database. This is the right initial architecture because listings, users, moderation, payments, notifications, and support share transactions and data. It keeps deployment, debugging, and local development simple.

Do not begin with microservices. Individual modules can be extracted later only when there is a measured need for independent scaling, deployment, or ownership.

### Recommended stack

| Area | Recommendation |
| --- | --- |
| Runtime | Java 21 LTS |
| Framework | Spring Boot 3.x |
| API | REST, versioned under `/api/v1`; OpenAPI first |
| Security | Spring Security; cookie-based session or short-lived JWT in secure HttpOnly cookies |
| Database | PostgreSQL 16 with PostGIS |
| ORM | Spring Data JPA / Hibernate; use native SQL where PostGIS needs it |
| Migrations | Flyway |
| Cache and limits | Redis |
| Media | Cloudflare R2 or S3 in production; MinIO locally |
| Background work | Spring Scheduler initially; add a queue only when workload requires it |
| Tests | JUnit 5, Testcontainers, MockMvc, and contract tests from OpenAPI |
| Observability | Spring Boot Actuator, structured logs, metrics, error tracking |
| Local environment | Docker Compose for PostgreSQL/PostGIS, Redis, and MinIO |

## 3. Deployment and boundaries

```text
marketplace Next.js  ─┐
                       ├── Spring Boot API ── PostgreSQL + PostGIS
personals Next.js    ─┘          │
                                 ├── Redis
                                 └── R2/S3 media storage
```

Deploy the Java API at `api.vezlist.cc`, or proxy it as `/api` through each Next.js frontend. The proxy approach is preferred because requests appear same-origin to the browser and simplify cookie security.

The two frontend sites must remain logically separated at the backend. Every listing, story, and site-specific content item has a `site_scope`:

- `MARKETPLACE`
- `PERSONALS`

The API must enforce this scope on every query and mutation. It must never rely on hiding a category in the frontend alone.

### Availability and failure isolation

The two frontend applications deploy independently. Therefore, an outage of the **Personals frontend** does not take down the Marketplace frontend: Marketplace can continue to call the shared API.

The initial API is shared, so an outage of the Spring Boot application, PostgreSQL, Redis, or shared media service would affect both sites. Prevent Personals-specific problems from becoming a whole-product outage by treating Personals as an isolated module inside the modular monolith:

```text
Spring Boot API
├── shared modules: identity, users, catalog, media, notifications
├── marketplace module: marketplace discovery and rules
└── personals module: eligibility, stories, strict moderation, personals rules
```

Apply these protections from the start:

- Separate Personals rate limits for search, uploads, story views, and write operations.
- Separate background-job queues/executors for Personals media, stories, and moderation work.
- Strict timeouts, bounded queues, and circuit breakers around expensive media or external-provider operations.
- Feature flags that can disable Personals stories or other non-essential features without disabling Marketplace.
- Separate object-storage prefixes or buckets for Marketplace and Personals media.
- Module-specific monitoring, alerts, dashboards, and error budgets.
- Database indexes and query limits that prevent Personals searches from exhausting shared database resources.

Extract Personals into an independently deployed backend service only when there is evidence for it: substantially different traffic/media scale, compliance or data-retention requirements, a separate owning team, a need for independent release cycles, or measured contention with Marketplace. Until then, one modular backend is safer and less expensive to operate than premature microservices.

## 4. Backend module count: 13

The initial backend is a **13-module modular monolith**. Each module owns its domain rules, tables, API endpoints, and internal services. Cross-module work must use public service interfaces or domain events rather than direct repository access.

| # | Module | Main responsibilities | MVP phase |
| ---: | --- | --- | --- |
| 1 | Identity and Access | Registration, login, logout, sessions, password reset, roles, account verification | 1 |
| 2 | Users and Profiles | Profile details, avatar, privacy settings, notification preferences, account deletion | 1 |
| 3 | Categories and Locations | Categories, provinces, cities/areas, valid category/site combinations | 1 |
| 4 | Listings | Drafts, publishing, editing, deletion, lifecycle and ownership | 1 |
| 5 | Media | Upload authorization, image validation, storage, ordering, cover selection, cleanup | 1 |
| 6 | Discovery | Search, filtering, cursor pagination, sorting, nearby and map results | 2 |
| 7 | Saved Listings | Save/remove a listing and the user's saved list | 2 |
| 8 | Seller and Reputation | Public seller profile, verified status, response/reputation data; reviews later | 2 |
| 9 | Moderation and Safety | Reports, review queues, approvals, rejections, audit trail, personals safeguards | 3 |
| 10 | Notifications | In-app notifications, read state, email/push delivery requests | 3 |
| 11 | Support | FAQ publishing, tickets, ticket replies, support-agent workflow | 3 |
| 12 | Billing and Credits | Payment-provider integration, payment methods, credit ledger, promotions, invoices/refunds | 4 |
| 13 | Status / Stories | Personals status media, 24-hour expiry, visibility and view tracking | 5 |

Direct buyer-to-seller chat is **not** included in the first 13 modules. The current frontend only has a mock “Message seller” action, not a real inbox. Add messaging after moderation, blocking/reporting, retention, and abuse controls are agreed.

## 5. Suggested project structure

```text
Backend/
  src/
    main/
      java/com/vezlist/
        VezlistApplication.java
        shared/
          config/          # security, OpenAPI, Jackson, CORS/proxy configuration
          error/           # consistent API error envelope and exception handling
          security/        # current-user access, permissions, CSRF helpers
          events/          # domain event contracts and handlers
          storage/         # S3/R2 abstraction
        identity/
        users/
        catalog/
        listings/
        media/
        discovery/
        saved/
        sellers/
        moderation/
        notifications/
        support/
        billing/
        stories/
      resources/
        application.yml
        db/migration/      # Flyway SQL migrations
  src/test/
  compose.yml
  Dockerfile
  pom.xml
  .env.example
  README.md
```

Within each domain module, use this dependency direction:

```text
web/controller -> application/service -> domain -> persistence adapter
```

Domain rules must not depend on Spring MVC, HTTP types, or database implementation details.

## 6. Core data model

The final schema can evolve, but the first design should include these main tables.

| Domain | Tables |
| --- | --- |
| Identity | `users`, `user_roles`, `sessions`, `password_reset_tokens`, `email_verification_tokens` |
| Profiles | `user_profiles`, `user_preferences`, `user_privacy_settings` |
| Catalog | `categories`, `locations` |
| Listings | `listings`, `listing_media`, `listing_attributes`, `listing_views`, `listing_promotions` |
| Saved | `saved_listings` |
| Moderation | `reports`, `moderation_cases`, `moderation_actions`, `audit_events` |
| Notifications | `notifications`, `notification_deliveries` |
| Support | `faq_categories`, `faqs`, `support_tickets`, `ticket_messages` |
| Billing | `payment_customers`, `payment_methods`, `credit_ledger`, `billing_transactions` |
| Stories | `stories`, `story_media`, `story_views` |

### Important fields and invariants

- Use UUID primary keys for externally exposed entities.
- All mutable tables need `created_at`, `updated_at`, and where appropriate `deleted_at`.
- `listings.owner_id` references `users.id`; ownership is always checked server-side.
- `listings.site_scope` is mandatory and indexed.
- Listing status: `DRAFT`, `PENDING_REVIEW`, `ACTIVE`, `REJECTED`, `EXPIRED`, `DELETED`.
- `listing_media.position` defines image order; position zero is the cover image.
- Store category-specific values in validated `listing_attributes` JSONB initially. Move heavily queried values to normal columns later.
- Store a PostGIS `geography(Point, 4326)` for approximate listing location. Public responses should round or hide exact coordinates according to privacy settings.
- Enforce one saved record per user/listing with `UNIQUE(user_id, listing_id)`.
- Use an append-only `credit_ledger`; never update a user's balance directly without a ledger record.
- Never store raw payment card number or CVC. Store provider tokens and display-safe metadata only.
- Stories have `expires_at`; expired stories must never be returned by public queries.

## 7. Essential API contract

Create the OpenAPI specification before implementing endpoints. All list responses use cursor pagination:

```json
{
  "items": [],
  "nextCursor": "opaque-cursor-or-null"
}
```

All errors use one predictable shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "One or more fields are invalid.",
  "details": [{ "field": "title", "message": "Must be at least 4 characters." }],
  "traceId": "..."
}
```

### MVP endpoint groups

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/password-reset/request
POST   /api/v1/auth/password-reset/confirm
GET    /api/v1/me

PATCH  /api/v1/me/profile
PATCH  /api/v1/me/preferences
PATCH  /api/v1/me/password
DELETE /api/v1/me

GET    /api/v1/categories?site=MARKETPLACE
GET    /api/v1/locations

GET    /api/v1/listings
POST   /api/v1/listings
GET    /api/v1/listings/{listingId}
PATCH  /api/v1/listings/{listingId}
DELETE /api/v1/listings/{listingId}
GET    /api/v1/me/listings

POST   /api/v1/listings/{listingId}/media/upload-url
POST   /api/v1/listings/{listingId}/media/complete
DELETE /api/v1/listings/{listingId}/media/{mediaId}
PATCH  /api/v1/listings/{listingId}/media/order

POST   /api/v1/listings/{listingId}/saved
DELETE /api/v1/listings/{listingId}/saved
GET    /api/v1/me/saved-listings

GET    /api/v1/users/{userId}
GET    /api/v1/users/{userId}/listings
```

### Listing search parameters

`GET /api/v1/listings` should support these query parameters from the current frontend:

```text
site, q, category, province, area,
minPrice, maxPrice, verifiedOnly, postedWithin,
sort, latitude, longitude, radiusKm, cursor, limit
```

Supported sort values: `newest`, `price-asc`, `price-desc`, `nearest`.

## 8. Security and privacy requirements

These are launch requirements, not later polish.

- Authentication tokens/sessions must live in `HttpOnly`, `Secure` cookies; never use localStorage for credentials.
- Protect cookie-authenticated state changes against CSRF.
- Apply rate limits to registration, login, password-reset, upload URL creation, ticket replies, reports, saves, and listing publishing.
- Validate all request bodies at the API boundary. Enforce size, type, count, and ownership rules server-side.
- Authorize every resource by user role and ownership; never trust a listing ID sent by the browser.
- Virus scan or quarantine uploaded media before public visibility; strip unsafe image metadata where appropriate.
- Signed storage URLs must be short-lived and scoped to a single upload/download action.
- Keep secrets in environment/secret management only; commit `.env.example`, never real credentials.
- Maintain audit events for moderation actions, account deletion, permissions changes, credit changes, and payment webhook processing.
- Treat personals as a higher-risk scope: mandatory age/eligibility checks, stricter moderation, careful location precision, report/block workflow before direct messaging, and appropriate retention rules.
- Account deletion should be an asynchronous, auditable workflow that respects legal, financial, and safety-retention obligations.

## 9. Phase overview

### Phase 0 — Foundation

**Goal:** a reliable backend base that every feature can build on.

1. Create Spring Boot project, Java 21 toolchain, Maven/Gradle choice, Dockerfile, and Docker Compose.
2. Add PostgreSQL/PostGIS, Redis, MinIO, Flyway, Actuator, and environment configuration.
3. Add global API error format, request validation, OpenAPI, health/readiness endpoints, structured logging, and trace IDs.
4. Add test setup with Testcontainers.
5. Write first ADRs: modular-monolith boundary, authentication style, media storage, and site-scope policy.

**Exit criteria:** a clean checkout starts locally, migrations run automatically, `/actuator/health` is healthy, and integration tests run against containers.

### Phase 1 — Accounts, catalog, listings, and media

**Goal:** a signed-in user can create and manage a real listing.

1. Implement Identity and Access, including registration, login/logout, password hashing, reset flow, and session revocation.
2. Implement User Profile endpoints and privacy/preferences persistence.
3. Seed categories and Canadian provinces/areas from the existing frontend catalog.
4. Implement Listing drafts and lifecycle transitions.
5. Implement direct-to-storage image upload flow, maximum six images, image ordering, and cover image selection.
6. Implement ownership checks, delete behavior, and listing-detail read API.

**Frontend integration:** replace `AuthContext` localStorage sign-in, profile mock data, create-ad publish mock, and ad-detail mock with API calls.

**Exit criteria:** create account, sign in, upload photos, submit a listing, reopen it after refresh, edit/delete it, and sign out.

### Phase 2 — Discovery, saved ads, seller pages, and My Ads

**Goal:** the main marketplace becomes useful with real search and browsing.

1. Build indexed listing search and cursor pagination.
2. Add PostGIS nearby search and approximate map pins.
3. Add filters and sorts matching the current UI.
4. Implement saved listings with idempotent save/remove actions.
5. Implement My Ads counts and status tabs.
6. Implement public seller profile and seller-listings endpoints.

**Frontend integration:** replace `mock.js` feed/filter data, Nearby data, SavedContext browser storage, My Ads local state, and SellerProfile mock data.

**Exit criteria:** filters and search are database-backed, results paginate, save state persists between devices, and nearby sort is correct.

### Phase 3 — Moderation, notifications, and support

**Goal:** support safe operations and a real post-publication lifecycle.

1. Add listing review queues and state transitions for pending, active, rejected, and expired listings.
2. Add reporting and audit logging.
3. Add user notifications and read/unread endpoints.
4. Add FAQ administration, tickets, and ticket messages.
5. Schedule listing-expiry and notification jobs.

**Frontend integration:** replace Notifications local state and ticket mock threads; connect listing status and support screens.

**Exit criteria:** moderated publishing works end-to-end, users receive persistent notifications, and tickets retain replies.

### Phase 4 — Payments, credits, and promotions

**Goal:** monetize listings safely.

1. Select and integrate a payment provider such as Stripe.
2. Use hosted payment collection or provider UI components; remove raw card-entry submission to the application.
3. Add webhooks with signature validation and idempotency keys.
4. Add immutable credit ledger, credit-pack checkout, billing history, refunds, and promoted listing purchase.
5. Add financial reconciliation and monitoring.

**Exit criteria:** payment retries/webhooks cannot double-credit an account, and all balance changes reconcile to transactions.

### Phase 5 — Personals status/stories

**Goal:** move personals-specific behavior to a safely isolated backend domain.

1. Implement story creation, media upload, visibility, view tracking, and 24-hour expiry.
2. Implement server-side site scope and eligibility rules.
3. Apply stricter moderation and reporting policies than marketplace listings.
4. Add direct messaging only after safety, consent, block/report, and retention decisions are approved.

**Exit criteria:** stories expire reliably and cannot leak across site scopes; age/eligibility restrictions are enforced by the backend.

## 10. Module-by-module execution plan

This is the implementation order for the 13 modules. Finish the acceptance criteria for a module before beginning dependent user-facing work. Small technical spikes are allowed earlier, but do not expose incomplete endpoints to the frontend as production features.

### Phase 0 — Platform foundation (before domain modules)

**Start with:** project bootstrap; no business module begins before this baseline exists.

**Implementation status (September 10, 2026): complete.** The Spring Boot/Maven foundation, Java 21 enforcement, Flyway/PostGIS migrations, Docker Compose services, versioned API, OpenAPI, health probes, trace IDs, consistent errors, CORS, Testcontainers, Dockerfile, environment template, and CI workflow are implemented. Docker Desktop and Testcontainers have been verified locally; both the fast and container-backed integration suites pass.

| Step | Deliverable | Done when |
| --- | --- | --- |
| 0.1 | Spring Boot application, Java 21 build, Dockerfile, Docker Compose | One command starts API, PostgreSQL/PostGIS, Redis, and MinIO locally. |
| 0.2 | Configuration and secrets policy | Profiles exist for local/test/staging/production; `.env.example` is complete and no real secret is committed. |
| 0.3 | Flyway and database conventions | An empty database migrates reliably in CI and locally. |
| 0.4 | Shared web/security base | Request IDs, validation, consistent errors, OpenAPI, health/readiness, CORS/proxy settings, and global exception handling work. |
| 0.5 | Test and delivery base | Testcontainers run in CI; formatting, tests, dependency scanning, and secret scanning are required checks. |

**Phase exit:** the API has `/actuator/health`, versioned `/api/v1` routing, OpenAPI output, structured logs, and a repeatable local environment.

### Phase 1 — Foundation of the product: modules 1–5

This phase creates the minimum secure vertical slice: a user can authenticate, maintain a profile, create a listing, upload photos, and manage their own listing.

#### Module 1 — Identity and Access

**Depends on:** Phase 0.

**Implementation status (September 6, 2026):** registration, login, logout, current-user lookup, BCrypt password hashing, roles, CSRF protection, persistent JDBC sessions, database migrations, and a live registration/session verification are implemented. Password-reset delivery and login rate limiting remain pending email-provider and Redis integration respectively.

1. Define roles: `USER`, `SUPPORT_AGENT`, `MODERATOR`, `ADMIN`.
2. Create `users`, `user_roles`, `sessions`, email-verification, and password-reset migrations.
3. Implement email/password registration with Argon2id or BCrypt password hashing.
4. Implement login, logout, session renewal/revocation, current-user lookup, and password reset.
5. Issue credentials only in secure HttpOnly cookies; add CSRF protection for cookie-authenticated writes.
6. Add login, registration, and reset rate limits plus audit events.
7. Test invalid credentials, expired/revoked sessions, CSRF failures, brute-force limits, and role enforcement.

**Frontend integration after completion:** replace the mock `AuthContext` login/localStorage behavior with `POST /auth/login`, `POST /auth/register`, `POST /auth/logout`, and `GET /me`.

**Done when:** a browser refresh preserves a secure session, logout revokes it, account-only routes are protected, and the frontend never stores credentials or tokens in localStorage.

#### Module 2 — Users and Profiles

**Depends on:** Module 1.

**Implementation status (September 7, 2026): complete for the Module 2 scope.** Flyway V4 creates separate profile, notification-preference, privacy-setting, and auditable deletion-request tables. Authenticated profile/preference read and update APIs, password change with other-session revocation, validation, duplicate-email handling, redacted password logging, and idempotent deletion requests are implemented. The Marketplace and Personals shared frontend now uses these APIs for the profile header, personal details, settings toggles, password change, and account deletion. Avatar storage is represented by `avatar_url`; upload and processing intentionally begins in Module 5 (Media).

1. Create `user_profiles`, `user_preferences`, and `user_privacy_settings` migrations.
2. Define profile DTOs: name, avatar, phone, location, bio, verification state, and public seller fields.
3. Implement read/update profile endpoints with server-side field validation.
4. Implement preference endpoints for email/push notifications, phone visibility, and approximate-location consent.
5. Define account deletion as an auditable request workflow rather than a direct hard delete.
6. Add ownership and privacy tests; never return private email/phone to another user.

**Frontend integration after completion:** connect Profile, Personal Details, Settings toggles, password change, and account-deletion request screens.

**Done when:** profile and preference changes persist across devices, privacy choices affect API responses, and private fields cannot be retrieved through a public seller endpoint.

#### Module 3 — Categories and Locations

**Depends on:** Phase 0; it may be developed in parallel with Modules 1–2, but must finish before listing publishing.

**Implementation status (September 7, 2026): complete for the Module 3 scope.** Flyway V5 creates site-scoped categories and hierarchical province/area locations, seeded from the frontend reference data. Public cached APIs return Marketplace or Personals categories and all enabled Canadian locations. Reusable server-side validators reject disabled, cross-site, unknown, and mismatched category/location references; Module 4 listing writes now use these validators. Both frontends load this catalog for category launchers, browsing/filtering, and the Create Ad flow, with a small read-only fallback if the API is temporarily unavailable.

1. Convert existing frontend categories and Canadian province/area data into Flyway seed data.
2. Create `categories` and `locations` tables, including parent/child location structure.
3. Add `site_scope` and enabled/disabled flags to categories.
4. Define which categories are valid for Marketplace and Personals.
5. Implement read-only public category/location endpoints with cache headers.
6. Add administration-only mutation endpoints later; do not let normal users create categories or locations.

**Frontend integration after completion:** replace category and popular-area constants in create-ad and filter UI with API data while retaining a small local fallback only for offline development.

**Done when:** both sites receive only categories permitted for their scope, and invalid category/location combinations are rejected at the API.

#### Module 4 — Listings

**Depends on:** Modules 1–3.

**Implementation status (September 10, 2026): complete for the Module 4 scope.** Flyway V6 adds site-scoped listings, attributes, view storage, idempotency records, durable listing events, indexes, optimistic locking, and PostGIS coordinates. Authenticated APIs create, update, submit, list, retrieve, and soft-delete owner listings with server-side validation, ownership checks, site isolation, and retry-safe create/submit operations. The shared Marketplace and Personals frontend now submits the Create Ad wizard to the API and uses persisted data for My Ads, editing, deletion, and UUID detail routes. The public `ACTIVE` transition remains owned by Module 9 moderation, and persisted photos intentionally begin in Module 5.

1. Create `listings`, `listing_attributes`, and `listing_views` migrations with UUIDs, owner IDs, site scope, status, price, location, coordinates, and timestamps.
2. Implement domain state transitions: `DRAFT -> PENDING_REVIEW -> ACTIVE`, plus `REJECTED`, `EXPIRED`, and `DELETED`.
3. Build create-draft, update-draft, submit-for-review, retrieve-detail, retrieve-my-listings, and delete endpoints.
4. Validate title, description, price, category, location, site scope, and required category-specific attributes on the server.
5. Enforce ownership on edit/delete; enforce site scope on every read.
6. Add idempotency keys to listing creation and publish operations so mobile retries cannot create duplicates.
7. Publish internal events such as `ListingSubmitted`, `ListingActivated`, and `ListingDeleted` for later modules.

**Frontend integration after completion:** connect the four-step Create Ad flow, Ad Detail page, and My Ads status list. Keep the wizard's temporary draft state local until API submission.

**Done when:** a user can create, reopen, edit, submit, and delete only their own listing; refreshed screens show database data and a Personals listing never appears in Marketplace queries.

#### Module 5 — Media

**Depends on:** Modules 1 and 4.

1. Create `listing_media` migration and a storage abstraction that works with MinIO locally and R2/S3 in production.
2. Implement a short-lived signed upload URL endpoint, scoped to the authenticated owner and listing.
3. Enforce image MIME type, file size, count limit of six, checksum, and safe object key naming.
4. Implement upload-complete confirmation, media ordering, cover-image assignment, and delete/cleanup behavior.
5. Add asynchronous image scanning/processing and prevent unprocessed or rejected files from public delivery.
6. Generate safe delivery URLs; do not expose storage credentials or unrestricted object paths.
7. Test cross-user upload attempts, over-six-photo cases, expired signed URLs, and cleanup after listing deletion.

**Frontend integration after completion:** replace `URL.createObjectURL`-only publish behavior with signed upload, completion confirmation, and persisted gallery images. Local previews remain useful before upload.

**Done when:** a user can upload up to six photos, reorder them, set the cover, reopen the listing after refresh, and no user can attach media to another user's listing.

**Phase 1 exit:** registration through real listing creation works end-to-end in a staging environment.

### Phase 2 — Marketplace usefulness: modules 6–8

#### Module 6 — Discovery

**Depends on:** Modules 3–5. It requires active listings and indexed locations.

1. Define the list/search response contract and cursor format in OpenAPI before implementation.
2. Add indexes for `site_scope`, status, category, created time, price, location, and PostGIS coordinates.
3. Implement search by title/description/seller, category, province, area, price range, verified-only, and posted-within filters.
4. Implement `newest`, price ascending/descending, and nearest sorting; nearest requires coordinates and a bounded radius.
5. Return only `ACTIVE` listings to public discovery queries.
6. Add cursor pagination, maximum limits, query timeouts, and query metrics.
7. Create a separate map-pin projection endpoint if the full listing payload becomes too expensive for map usage.
8. Test cursor stability, filter combinations, scope isolation, and PostGIS distance correctness.

**Frontend integration after completion:** replace `applyFilters` over mock arrays in Home, Browse, and Nearby with query-backed server data. Keep filters and search in URL parameters.

**Done when:** browsing remains fast with large datasets, pagination has no duplicates/missing rows, and a Personals query cannot return Marketplace listings or vice versa.

#### Module 7 — Saved Listings

**Depends on:** Modules 1 and 4.

1. Create `saved_listings` with a unique `(user_id, listing_id)` constraint.
2. Implement idempotent save and unsave endpoints.
3. Implement a cursor-paginated saved-list endpoint that excludes deleted/inaccessible listings cleanly.
4. Publish save-count events for My Ads metrics and future notifications, without exposing who saved a listing.
5. Test repeated requests, concurrent saves, deleted listings, and cross-scope behavior.

**Frontend integration after completion:** replace `SavedContext` localStorage with query mutations and optimistic UI rollback.

**Done when:** saved state persists across devices, duplicate saves are impossible, and unavailable listings have a clear response/empty state.

#### Module 8 — Seller and Reputation

**Depends on:** Modules 1, 2, 4, and 6.

1. Define a safe public seller projection that excludes private profile fields.
2. Implement public seller profile, seller's active listing list, membership date, verified state, and response-time placeholder/source.
3. Add verification state owned by moderation/admin, not editable by users.
4. Add reputation/reviews only when product rules for verified transactions, fraud handling, and dispute removal are approved.
5. Test private data leakage, inactive/deleted listing visibility, and scoped seller results.

**Frontend integration after completion:** replace SellerProfile mock data and seller card fields on Ad Detail.

**Done when:** seller pages are public where intended, privacy is preserved, and profile/listing counts are correct.

**Phase 2 exit:** the Marketplace feed, Nearby, saved ads, My Ads, seller page, search, and filters are entirely API-backed.

### Phase 3 — Safe operations: modules 9–11

#### Module 9 — Moderation and Safety

**Depends on:** Modules 1, 4, 5, and 8.

1. Create `reports`, `moderation_cases`, `moderation_actions`, and `audit_events`.
2. Define listing-review policy by site scope and category; Personals must use stricter policies.
3. Implement report creation, case assignment, moderator notes, approve, reject, remove, and appeal-ready actions.
4. Make listing status changes transactional and emit notifications/events only after success.
5. Build moderator/admin APIs separately from public APIs with strict role checks.
6. Add media review/scanning results to the decision process.
7. Test role boundaries, immutable audit records, report abuse limits, and state-transition rules.

**Frontend integration after completion:** connect pending/rejected/active states in My Ads and add reporting paths where the product approves them.

**Done when:** no listing can self-approve, every moderator decision is audited, and a rejected listing includes a safe user-visible reason.

#### Module 10 — Notifications

**Depends on:** Modules 1, 4, 7, 9, and an event mechanism.

1. Create `notifications` and `notification_deliveries` tables.
2. Define notification event types: listing approved/rejected/expiring, listing saved aggregate, support reply, payment event, and security event.
3. Implement in-app list, unread count, mark-one-read, mark-all-read, and preference-aware delivery endpoints.
4. Process notification events asynchronously with retry and deduplication.
5. Add email/push providers behind interfaces; start with in-app notifications before enabling external delivery.
6. Test duplicate events, failures, unread counts, and permission boundaries.

**Frontend integration after completion:** replace Notifications page local state and update the navigation badge from unread-count data.

**Done when:** notification state is durable, events do not create duplicates, and read status persists.

#### Module 11 — Support

**Depends on:** Modules 1 and 10.

1. Create `faq_categories`, `faqs`, `support_tickets`, and `ticket_messages`.
2. Seed existing FAQs and categories; make FAQs public/read-only and tickets authenticated.
3. Implement ticket creation, customer ticket list/detail, message posting, ticket status, and attachment policy if required.
4. Implement support-agent APIs separately, with assignment and internal notes not visible to customers.
5. Emit a notification when an agent/customer replies.
6. Enforce rate limits, input validation, attachment limits, and ownership checks.
7. Test that a user cannot read or reply to another user's ticket.

**Frontend integration after completion:** replace Support, Tickets, and Ticket Detail mock data; persist ticket replies.

**Done when:** tickets retain their full history, support agents can reply safely, and users see only their own tickets.

**Phase 3 exit:** listings can be moderated, users receive real notifications, and support operations are persistent and auditable.

### Phase 4 — Monetization: module 12

#### Module 12 — Billing and Credits

**Depends on:** Modules 1, 4, 9, and 10.

1. Choose the payment provider and document currencies, taxes, refund policy, and supported regions.
2. Create `payment_customers`, `payment_methods`, `credit_ledger`, and `billing_transactions`.
3. Implement provider customer creation and hosted payment-method setup; the Vezlist API must never accept raw card number or CVC.
4. Implement credit-pack checkout and signed webhook processing with idempotency and replay protection.
5. Implement immutable ledger entries for purchases, promotions, refunds, adjustments, and reversals.
6. Implement listing-promotion purchase, eligibility rules, expiration, and placement impact.
7. Implement billing history and safe display metadata endpoints.
8. Add reconciliation jobs and alerts for unmatched provider events/ledger changes.
9. Test repeated webhooks, concurrent promotion requests, failed payment, refund, and balance correctness.

**Frontend integration after completion:** replace the current in-memory Payment Methods and credit-purchase actions with provider-hosted payment flows and billing API data.

**Done when:** card data never reaches the backend, credits cannot be duplicated, every balance change has a ledger record, and promotions are only activated after confirmed payment.

**Phase 4 exit:** customers can safely buy credits and promote eligible listings.

### Phase 5 — Personals-specific capabilities: module 13

#### Module 13 — Status / Stories

**Depends on:** Modules 1, 2, 5, 9, and 10.

1. Confirm server-side age/eligibility, visibility, retention, and moderation policy before building endpoints.
2. Create `stories`, `story_media`, and `story_views`; every row has `site_scope = PERSONALS`.
3. Reuse the media-storage abstraction but apply separate Personals quotas, storage prefixes, scanners, and job execution capacity.
4. Implement create story, list visible active stories, view story, mark viewed, and delete own story.
5. Enforce `expires_at` at query level and run cleanup after expiry; do not rely on the frontend timer.
6. Implement story moderation/removal and reporting through Module 9.
7. Add feature flags/circuit breakers so story problems can be disabled without affecting Marketplace.
8. Test scope leakage, expiry, eligibility checks, view uniqueness, media permissions, and failure isolation.

**Frontend integration after completion:** replace `StatusContext` localStorage and story mock data in Status Updates and Status Viewer. The existing age gate/discreet-mode UI remains frontend behavior, with backend eligibility enforcement added.

**Done when:** stories are available only in Personals, expire after 24 hours on the server, view state persists, and disabling the stories feature does not affect Marketplace APIs.

**Phase 5 exit:** the Personals experience has API-backed stories and retains its independent operational safeguards.

### Post-launch — Separate service decision checkpoint

Review Personals extraction quarterly or after a significant incident. Split it from the monolith only when measurable evidence supports one of these reasons:

- Its traffic, uploads, media processing, or database load meaningfully contends with Marketplace.
- Legal/compliance, retention, residency, or access controls require separate infrastructure.
- It needs independent deployment velocity or a dedicated team.
- Its availability requirement is materially different from Marketplace.

If extraction is approved, move Personals API endpoints, tables/data ownership, workers, storage bucket, and monitoring to a dedicated service. Keep identity integration explicit through a versioned internal contract; do not let two services share the same database tables.

## 11. Frontend integration strategy

Do not replace every mock in one large change. Integrate feature by feature behind a small shared API client.

1. Add `packages/shared/src/lib/api/` for typed HTTP calls and error parsing.
2. Add TanStack Query or SWR for server data, mutations, invalidation, retries, loading, error, and empty states.
3. Keep short-lived UI state local: modal visibility, create-ad draft before publishing, and active gallery photo.
4. Move search/filter state into URL query parameters, so results are shareable and survive refreshes.
5. Replace browser-persisted auth with backend sessions.
6. Replace browser-persisted saved ads and story views with API-backed state.
7. Keep `mock.js` only as development seed/fixture data until each feature is migrated, then remove the relevant exports.

## 12. Testing and quality gates

- Unit-test domain rules: listing state transitions, validation, ownership, credits, story expiry.
- Integration-test repository queries, PostGIS search, Flyway migrations, upload completion, and security filters with Testcontainers.
- Contract-test controllers against OpenAPI.
- Add end-to-end tests for registration, login, listing creation/upload/publish, save, search, ticket reply, and payment webhook behavior.
- Require successful migration, tests, formatting/linting, dependency scanning, and secret scanning in CI.
- Test authorization explicitly: users must not read, edit, delete, or upload media for another user's resources.

## 13. Initial delivery order

The recommended first production slice is modules **1–7**:

1. Identity and Access
2. Users and Profiles
3. Categories and Locations
4. Listings
5. Media
6. Discovery
7. Saved Listings

This replaces the frontend's core mock-data flow and makes both sites useful before introducing operational and financial complexity.

## 14. Decisions to confirm before implementation

- Authentication model: server session versus signed access/refresh tokens in HttpOnly cookies.
- Payment provider and countries/currencies supported.
- Whether all new listings require review, or only specific categories/site scopes.
- Exact age-verification, moderation, and retention rules for personals.
- Whether direct messaging is required for launch.
- Hosting target for Spring Boot, PostgreSQL, Redis, and media.
- Whether the API is exposed directly at `api.vezlist.cc` or proxied through the Next.js apps.
- Required staff/admin capabilities and who may moderate, resolve tickets, or issue credits/refunds.
- Confirmed architecture: one Spring Boot modular monolith at launch; Personals is an isolated module with independent rate limits, job capacity, feature flags, storage boundaries, and observability. Reassess extraction into a separate service only against the criteria in "Availability and failure isolation".
