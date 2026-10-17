# Vezlist API

Java 21 / Spring Boot backend for the Vezlist Marketplace and Personals frontends.

## Phase 0 status

This foundation includes PostgreSQL/PostGIS migrations, Redis and MinIO local-service definitions, OpenAPI, Actuator health probes, a consistent API error envelope, request trace IDs, CORS configuration, and a Testcontainers-ready test dependency set.

## Prerequisites

- Java 21
- Maven 3.9+
- Docker Desktop (needed to run the local PostgreSQL, Redis, and MinIO services)

## Run locally

```powershell
Copy-Item .env.example .env
docker compose --env-file .env up -d
mvn spring-boot:run
```

Spring Boot reads `Backend/.env` for local development. The file is ignored by Git; production must provide the same variables through its hosting platform's secret manager rather than a file.

The Compose PostgreSQL service is published on host port `5433` to avoid colliding with a PostgreSQL installation already using the usual `5432` port. It still listens on port `5432` inside its Docker container.

Useful endpoints once the API is running:

- `http://localhost:8080/api/v1`
- `http://localhost:8080/actuator/health`
- `http://localhost:8080/actuator/health/readiness`
- `http://localhost:8080/v3/api-docs`
- `http://localhost:8080/swagger-ui.html`

## Identity endpoints (Module 1)

The API now supports registration, login, logout, and the authenticated current-user endpoint. Because browser sessions are protected against CSRF, first request `GET /api/v1/auth/csrf`; send its `token` in the returned `headerName` on every `POST` request, while retaining the response cookies.

```text
GET  /api/v1/auth/csrf
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

See `TEST_CASES.md` for ready-to-run requests and expected results.

## User and profile endpoints (Module 2)

All Module 2 endpoints require the authenticated session cookie. `PATCH` and `DELETE` requests also require the CSRF header/token returned by `GET /api/v1/auth/csrf`.

```text
GET    /api/v1/me/profile
PATCH  /api/v1/me/profile
GET    /api/v1/me/preferences
PATCH  /api/v1/me/preferences
PATCH  /api/v1/me/password
DELETE /api/v1/me
```

Account deletion returns HTTP 202 and records a pending request; it does not immediately hard-delete user data. Profile-photo upload is separate from the Module 5 listing-media endpoints and remains future work.

## Category and location endpoints (Module 3)

These endpoints are public. The category query is site-scoped, so Marketplace never receives the Personals category and Personals never receives Marketplace categories. Category responses use `Cache-Control: no-cache` so new requests reflect admin changes; the location tree remains cacheable for one hour.

```text
GET /api/v1/categories?site=MARKETPLACE
GET /api/v1/categories?site=PERSONALS
GET /api/v1/locations
GET /api/v1/locations/search?q=Vancouver&limit=20
```

Location search reads enabled areas with enabled parent provinces from the database.
An empty query returns suggestions, with popular areas first. `q` matches area or
province names (up to 120 characters); `limit` defaults to 20 and accepts 1-50.
Responses contain area and province IDs and labels and require cache revalidation
so catalog edits appear on subsequent requests. The create/edit picker uses this
endpoint without a mock fallback. Restart the backend after updating the code;
this search endpoint requires no new migration or seed data.

## Listing endpoints (Module 4)

Listing writes require an authenticated session and CSRF token. Create and submit also require a unique `Idempotency-Key` header so a safe retry cannot create or submit the same listing twice.

```text
POST   /api/v1/listings
PATCH  /api/v1/listings/{listingId}
POST   /api/v1/listings/{listingId}/submit
GET    /api/v1/listings/{listingId}?site=MARKETPLACE
GET    /api/v1/me/listings?site=MARKETPLACE
GET    /api/v1/me/listings/summary?site=MARKETPLACE
DELETE /api/v1/listings/{listingId}
```

The Create Ad, My Ads, edit/delete, and listing-detail frontend flows use these endpoints.

The authenticated summary returns `{ "activeAds": 0 }` (the actual count), scoped
to the session owner and requested site. It excludes non-active and expired ads
and disabled owners. The profile card uses this count rather than downloading
every owned listing. Restart the backend after adding this route; no schema
migration or reseeding is required for the summary.

Submission accepts an optional JSON body `{ "requestVerification": true }`.
Without it (or with `false`), a valid ad becomes `ACTIVE` immediately on either
site, with publication time and a 30-day expiry. All attached images must be
`READY`; ownership and enabled category/location checks still apply. Selecting
verification sets `verificationRequested: true` and keeps the ad `PENDING_REVIEW`
and private until staff approve its code/photo verification. Approval publishes
it with the Verified badge; rejection keeps it private. The existing verification
API supplies the code and upload flow, which can be resumed from My Ads.

Flyway V16 adds this policy and runs on backend startup. No reseeding is needed.
Existing pending ads are not automatically published. Direct publication emits
`LISTING_PUBLISHED`; staff verification publication emits `LISTING_APPROVED`.

## Media endpoints (Module 5)

Media writes require an authenticated session and an editable `DRAFT` or `REJECTED` listing. The browser uploads directly to the returned short-lived MinIO/S3 URL and must send every `requiredHeaders` entry unchanged.

```text
POST   /api/v1/listings/{listingId}/media/upload-url
POST   /api/v1/listings/{listingId}/media/{mediaId}/complete
PATCH  /api/v1/listings/{listingId}/media/order
DELETE /api/v1/listings/{listingId}/media/{mediaId}
```

JPEG, PNG, and WebP images up to 10 MB are accepted, with a maximum of six per listing. The API verifies the actual file signature, size, SHA-256 checksum, and stored metadata asynchronously. Only `READY` media receives a short-lived delivery URL. Local MinIO allows the two frontend development origins configured by `VEZLIST_CORS_ALLOWED_ORIGINS`.

## Discovery endpoints (Module 6)

Discovery reads are public, always require a site scope, and only return active listings. Nearest and map queries also require `latitude`, `longitude`, and a radius no larger than 100 km.

```text
GET /api/v1/listings?site=MARKETPLACE&sort=NEWEST&limit=24
GET /api/v1/listings?site=MARKETPLACE&q=bike&category=vehicles&province=bc
GET /api/v1/listings?site=MARKETPLACE&sort=NEAREST&latitude=48.4284&longitude=-123.3656&radiusKm=5
GET /api/v1/listings/map?site=MARKETPLACE&latitude=48.4284&longitude=-123.3656&radiusKm=5
```

Use the returned `nextCursor` unchanged with the same filters. The cursor is intentionally opaque and is rejected if its filters or sort do not match. The standalone contract is in `docs/openapi/module-6-discovery.yaml`; generated Springdoc remains available at `/v3/api-docs`.

## Saved Listings endpoints (Module 7)

Saved-listing endpoints require an authenticated session and a site scope. The POST and DELETE requests also require the CSRF header/token returned by `GET /api/v1/auth/csrf`.

```text
GET    /api/v1/listings/{listingId}/saved?site=MARKETPLACE
POST   /api/v1/listings/{listingId}/saved?site=MARKETPLACE
DELETE /api/v1/listings/{listingId}/saved?site=MARKETPLACE
GET    /api/v1/me/saved-listings?site=MARKETPLACE&limit=24
```

Saving and removing are idempotent. Only another user's active, unexpired listing from the requested site can be saved. Removing remains safe after a listing becomes unavailable. The saved feed returns only accessible card data, signs only READY cover media, and uses an opaque cursor bound to the account and site. See `docs/openapi/module-7-saved-listings.yaml` for the standalone contract.

## Moderation and safety (Module 9)

Flyway V11 added reporting, owner appeals, media verdicts, and append-only audit
history. Under V16, new regular submissions publish directly; verification-requested
ads use the verification queue, not a duplicate submission case. Existing pending
submission and appeal cases retain the original moderation policy (one Marketplace
reviewer, two Personals reviewers). Reporting and removal of active ads remain
available on both sites. A moderation approval cannot bypass pending verification.

See [the moderation workflow](docs/moderation.md) for staff endpoints, privacy,
quotas, manual media/eligibility requirements, and rollout limitations, and
[the API contract](docs/openapi/module-9-moderation.yaml) for request shapes.

## Notifications (Module 10)

Flyway V12 adds the persistent site-scoped inbox, transactional event queue, and
per-channel delivery records. Both frontends use real unread counts and durable
read-one/read-all actions. Background workers process listing moderation, daily
save aggregates, expiry reminders, and password-change security events with
deduplication and bounded retry. In-app delivery is enabled; email/push providers
are not configured. Existing preferences govern those optional channels.

See [the notification workflow](docs/notifications.md) and
[the API contract](docs/openapi/module-10-notifications.yaml) for endpoints,
privacy, worker operation, and verification instructions.

## Admin console API (Module 11)

Flyway V13 adds `admin_audit_log` and suspension detail on `app_users`. A
dev-only `AdminAccountSeeder` is disabled by default. For local development,
set `VEZLIST_SEED_ADMIN=true` and provide a unique 12+ character
`VEZLIST_SEED_ADMIN_PASSWORD` before starting the API. It creates
`admin@vezlist.cc` with the ADMIN role and refuses to promote an existing user.

All endpoints below are under `/api/v1/admin/**`, require MODERATOR or ADMIN
for reads, and ADMIN for anything destructive (see `SecurityConfig` and each
controller's `@PreAuthorize`):

- `GET /admin/users?query=&cursor=&limit=` / `GET /admin/users/{id}` — cursor-paginated user search and detail
  (roles, enabled/suspension state, listing counts).
- `POST /admin/users/{id}/suspend` `{reason}"` / `POST /admin/users/{id}/reinstate` — ADMIN-only; suspend flips the
  same `app_users.enabled` flag already used app-wide (moderation, saved listings, discovery, sellers), and
  records `suspended_at`/`suspension_reason`.
- `GET /admin/listings?site=&status=&query=&cursor=&limit=` / `GET /admin/listings/{id}` — admin-scoped browse
  across every owner (unlike the owner-scoped `GET /me/listings`).
- `POST /admin/listings/{id}/remove` `{reason}` — ADMIN-only force takedown; only legal from `ACTIVE`, using the
  same `Listing` state machine as moderation's own REMOVE decision.
- `GET/POST/PATCH/DELETE /admin/categories[/{id}]` and `GET /admin/locations`, `POST /admin/locations/areas`,
  `PATCH/DELETE /admin/locations/{id}` — taxonomy CRUD. Deleting a category or area that active listings still
  reference returns `409 CATALOG_ENTRY_IN_USE` instead of cascading.
- `GET /admin/analytics/summary?site=` — real aggregate counts (users, listings by status, new listings in the
  last 7/30 days, active reports, open moderation cases); no fabricated numbers.
- `GET /admin/audit?site=&cursor=&limit=` — flattens moderation decisions (`moderation_actions`) and other admin
  actions (`admin_audit_log`: suspend/reinstate, taxonomy CRUD, listing takedown) into one chronological feed.

The payment gateway is deferred. Gcore live sessions and demo creator checkout are described below.

## Support tickets and help articles

Flyway V17 stores owner-scoped tickets and messages. Members can create, list, read, and reply under
`/api/v1/me/tickets`; moderators and admins can list both sites, reply, and resolve tickets under
`/api/v1/admin/tickets`. A member cannot read or reply to another member's ticket.

Flyway V18 stores help articles. Published articles are public at `GET /api/v1/support/articles`;
authenticated moderators and admins can manage drafts and publication under
`/api/v1/support/articles/admin`. Lists use `limit` (1-100) and `offset` pagination.

Both migrations run automatically on backend startup. They create empty tables; no sample support
conversations or answers are inserted. Content must be authored in the console before it appears publicly.

## Personals live presence and featured discovery

Flyway V19-V21 introduced presence and featured-slot rotations. V25 replaces the old presence
HTTP endpoints with actual live sessions. The old presence table is retained for migration safety.
`GET /api/v1/live` now lists provider-confirmed live/reconnecting sessions with enabled creator accounts.
V26 makes live sessions independent of ads; publishing or selecting an ad is not required.

`GET /api/v1/personals/featured?feed=AVAILABLE_NOW|NEW_TODAY|TRENDING` returns up to five ads
per feed for the current rotation. A listing is assigned to at most one featured feed.
`all=true` returns up to 60 eligible ads from the same rotation for the full Trending
grid, in the same score order. Cards include persisted `viewCount` and `saveCount`.
Availability intent, last-24-hour freshness, and last-four-hour saves determine eligibility.
Recent featured-slot allocations temper raw saves and favor less-exposed ads. All active ads
remain in normal Browse, where `availableOnly=true` filters by the creator preference.

Featured discovery remains independent of the live-video directory. Purchased Boost/Bump and a
real payment gateway remain separate work.

## Live video and session chat

The creator flow is introduction, backend plans, optional direct-payment details, review, demo
checkout, camera broadcast. Watching is free and public; sending chat requires an enabled account.
Creators can go live directly from their account without an ad. Admins manage `/live-plans`; admins and moderators can
end sessions from `/live`. Prices are snapshotted and optimistic versions prevent stale purchases.

### Configuration

1. Activate **Video Streaming** in your Gcore account and create a server-side API token with
   Streaming read/write access. Set `VEZLIST_GCORE_API_TOKEN` in `Backend/.env` or the backend
   secret manager. Never put it in frontend variables or commit it. The API uses
   `Authorization: APIKey <token>` against `https://api.gcore.com/streaming`.
2. No webhook, playback signing key, or recording-consent flag is needed. The backend polls
   authenticated stream status (a bounded five-session batch every five seconds). Only Gcore's
   actual `live`/`backup_live` signal starts the session timer; an enabled ingest alone does not.
3. Each stream is created with `auto_record=false` and `dvr_enabled=false`. There is no VOD,
   recording, or DVR/rewind workflow. If provider status later reports recording/DVR enabled,
   the session is ended and queued for provider shutdown. Normal short playback buffers still
   exist. Do not enable recording manually in the Gcore dashboard. Recordings independently
   created in that dashboard are not managed or deleted by this application.
4. Install FFmpeg with libx264/AAC and set `VEZLIST_FFMPEG_PATH` to its executable. The backend
   Docker image includes it. Native development must install it separately. Browser WebM/MP4
   chunks are piped into FFmpeg and directly to Gcore RTMPS; media is never written to local disk.
   Only standard Gcore `gvideo.co`/`gvideo.io` ingest and playback hosts are accepted; custom
   delivery domains need a separately reviewed allowlist change.
5. Configure Redis and public `wss://` broadcast/chat URLs in production. The reverse proxy must
   support WebSocket Upgrade and long connections on `/api/v1/live/broadcast` and `/api/v1/live/chat`.
   Use exact frontend origins, HTTPS for camera access, and disable local CORS patterns outside development.
6. Set `VEZLIST_LIVE_DEMO_PURCHASES_ENABLED=true` only where demo checkout is wanted. It does not
   charge money and still requires a working provider before a session can start. Viewing is free.
7. Restart the backend. `GET /api/v1/live/plans` should report `recordingPolicy: "NO_RECORDING"`
   and `streamingAvailable: true` once the token and encoder are configured. This readiness check
   checks local configuration, not whether Gcore accepts the token. Perform a real broadcast test
   to validate permissions, subscription, ingest connectivity, and delivery.

### Migrating from Mux

Flyway V27 labels pre-existing sessions `MUX` and new sessions `GCORE`, preserves historical
sessions/tickets, and separates provider IDs and open-session uniqueness. The live API no longer
publishes or resumes Mux sessions, and the Gcore cleanup worker never sends old Mux IDs to Gcore.
The old Mux webhook endpoint and Mux configuration are no longer used. If a deployment previously
created real Mux streams or recordings, disable/delete those resources in the Mux dashboard before
retiring that account; retained legacy cleanup jobs are not executed by the new Gcore worker.

### Operation and limits

`POST /api/v1/live/sessions` accepts a stable `Idempotency-Key`. Only authenticated Gcore status
reconciliation makes a session LIVE and starts its server deadline. Ending, expiry,
suspension stop access. Ad changes do not affect live sessions. Reconnection keeps the original deadline and allows 30 seconds after the first offline observation.
Provider disable/delete operations use durable retries; provider outages can delay remote shutdown.
Camera publishing uses short-lived, single-use tickets, a Redis ownership lock, a 4 MiB buffer
including queued and in-flight data, a 128-frame cap, and a default limit of four FFmpeg processes
per node. A 15-second stalled-writer/queued-frame watchdog prevents indefinite buffering;
brief encoder startup bursts are tolerated without assuming the user's network is too slow.
FFmpeg input probing is bounded to one second of analysis and 1 MiB. Load test before raising limits;
deploy media workers with CPU/memory limits and monitor dropped connections and provider errors.

Chat uses Redis pub/sub across API nodes, last-100-message history, rate limiting, duplicate-message
acknowledgements, and host/moderator deletion and muting. Viewer counts measure connected room
identities, deduplicate tabs, exclude the host, and expire missed heartbeats after 45 seconds.
They do not prove every counted browser is actively playing video. Chat history is purged at end;
database cleanup markers retry after Redis outages, and all ephemeral data has a fallback TTL.
Guests read chat; signing in enables sending. Tickets go in the first WebSocket frame, never URLs.

Gcore HLS delivery goes directly to viewers through Gcore's CDN. The backend prefers the CMAF
HLS URL and falls back to MPEG-TS HLS when needed. URLs are public for free viewing; they are not
per-viewer signed or DRM-protected. Provider shutdown removes the source; already buffered media
can finish playing. The player uses adaptive quality,
native HLS where supported, and HLS.js otherwise, with no replay/seek/download controls. The
browser bridge and ordinary HLS playback are not sub-second WebRTC. Canada-to-viewer playback
still needs a real-device/network test with the configured Gcore account before launch.

### Provider references and live acceptance test

The adapter follows the [official Gcore SDK stream contract](https://github.com/G-Core/gcore-go/blob/main/streaming/stream.go)
and [Gcore ingest requirements](https://gcore.com/docs/streaming-platform/live-streams-and-videos-protocols-and-codecs/input-parameters-and-codecs).
Create uses a flat request body; updates use the documented `stream` wrapper. Credentials and
full ingest URLs stay server-side. There is no simulated provider-success mode.

Before production: start a demo broadcast from a creator account, grant camera/microphone access,
open the session in a separate viewer browser/device, check video/audio and both directions of
chat, reconnect the camera, then end the live. Check the directory removes it and Gcore deletes
the stream. Verify `auto_record` and `dvr_enabled` remain false and no recording is created. Test
from Canada and your expected creator locations; no latency/quality claim substitutes for this test.

## Verification commands

```powershell
mvn verify
mvn -Pintegration verify
```

Docker is not required for the fast tests. The integration command uses Testcontainers and requires Docker Desktop.
