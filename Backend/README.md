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

These endpoints are public and return cacheable reference data. The category query is site-scoped, so Marketplace never receives the Personals category and Personals never receives Marketplace categories.

```text
GET /api/v1/categories?site=MARKETPLACE
GET /api/v1/categories?site=PERSONALS
GET /api/v1/locations
```

The frontend loads these values automatically and retains a bundled read-only fallback for temporary API outages. Restart the backend once after pulling Module 3 so Flyway can apply V5.

## Listing endpoints (Module 4)

Listing writes require an authenticated session and CSRF token. Create and submit also require a unique `Idempotency-Key` header so a safe retry cannot create or submit the same listing twice.

```text
POST   /api/v1/listings
PATCH  /api/v1/listings/{listingId}
POST   /api/v1/listings/{listingId}/submit
GET    /api/v1/listings/{listingId}?site=MARKETPLACE
GET    /api/v1/me/listings?site=MARKETPLACE
DELETE /api/v1/listings/{listingId}
```

The Create Ad, My Ads, edit/delete, and listing-detail frontend flows use these endpoints.

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

Flyway V11 queues pending listings for staff review and adds reporting, owner
appeals, media verdicts, and append-only audit history. Marketplace needs one
reviewer; Personals needs two independent reviewers. New reporting and appeal
forms are shared by both frontends.

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

## Verification commands

```powershell
mvn verify
mvn -Pintegration verify
```

Docker is not required for the fast tests. The integration command uses Testcontainers and requires Docker Desktop.

## Next module

Module 11 - Support: persistent tickets, customer replies, and support-agent APIs.
