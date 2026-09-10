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

Account deletion returns HTTP 202 and records a pending request; it does not immediately hard-delete user data. Profile-photo upload is intentionally deferred to Module 5 because media validation and storage must be implemented together.

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

The Create Ad, My Ads, edit/delete, and listing-detail frontend flows now use these endpoints. Listing media is returned as an empty list until Module 5 adds signed uploads and persistent galleries.

## Verify

```powershell
mvn verify
mvn -Pintegration verify
```

Docker is not required for the fast tests. The integration command uses Testcontainers and requires Docker Desktop.

## Next module

Module 5 — Media: signed image uploads, validation, ordering, cover images, and persistent galleries.
