# Vezlist Backend Test Cases

## How to use this document

- **Ready** means the test can be run now against the Phase 0 backend.
- **Planned** means the test is specified now but becomes runnable when its module is built.
- Run each manual API test with Swagger UI, Postman, or PowerShell.
- Automated tests belong in `src/test/java`; manual/regression cases stay in this document.

## Test environment

| Item | Local value |
| --- | --- |
| API base URL | `http://localhost:8080` |
| Docker PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |
| MinIO API | `http://localhost:9000` |
| MinIO console | `http://localhost:9001` |
| API documentation | `http://localhost:8080/swagger-ui.html` |

Before running ready tests:

```powershell
cd E:\Works\vezlist\Backend
docker compose --env-file .env up -d
mvn spring-boot:run
```

## Phase 0 — Ready test cases

| ID | Area | Test case | Steps | Expected result |
| --- | --- | --- | --- | --- |
| TC-P0-001 | Docker | Start local dependencies | Run `docker compose --env-file .env up -d`, then `docker compose ps`. | `postgres`, `redis`, and `minio` are running; PostgreSQL and Redis become healthy. |
| TC-P0-002 | Database | Verify Docker PostgreSQL port isolation | Run `docker compose ps`. | The PostgreSQL port mapping is `5433->5432`, so Vezlist does not collide with a Windows PostgreSQL on port 5432. |
| TC-P0-003 | Database | Verify PostGIS availability | Run `docker compose exec postgres psql -U vezlist -d vezlist -c "SELECT PostGIS_Version();"`. | One row returns a PostGIS version. |
| TC-P0-004 | Startup | Start the backend | Run `mvn spring-boot:run`. | Logs contain `Started VezlistApplication`; no Flyway, database, or port error appears. |
| TC-P0-005 | Migration | Verify Flyway migration | Inspect startup logs after TC-P0-004. | First run applies `V1__enable_postgis`; later runs report the schema is up to date. |
| TC-P0-006 | API | Verify versioned API entry point | Send `GET http://localhost:8080/api/v1`. | HTTP 200 with JSON containing `name: Vezlist API` and `version: v1`. |
| TC-P0-007 | Health | Verify application health | Send `GET http://localhost:8080/actuator/health`. | HTTP 200 with `status: UP`. |
| TC-P0-008 | Health | Verify readiness | Send `GET http://localhost:8080/actuator/health/readiness`. | HTTP 200 after the API has connected to PostgreSQL. |
| TC-P0-009 | API docs | Verify OpenAPI document | Send `GET http://localhost:8080/v3/api-docs`. | HTTP 200 JSON OpenAPI document. |
| TC-P0-010 | API docs | Verify Swagger UI | Open `http://localhost:8080/swagger-ui.html` in a browser. | Swagger UI loads without an error. |
| TC-P0-011 | Observability | Verify generated request ID | Send `GET /api/v1` without an `X-Request-Id` header. | Response contains a non-empty `X-Request-Id` response header. |
| TC-P0-012 | Observability | Verify supplied request ID | Send `GET /api/v1` with header `X-Request-Id: test-request-001`. | HTTP 200; response returns `X-Request-Id: test-request-001`. |
| TC-P0-013 | Configuration | Verify missing database credentials fail safely | Temporarily rename `.env`, then run `mvn spring-boot:run`; restore `.env` immediately afterward. | Startup fails due to missing datasource configuration; it must not use a hidden default credential. |
| TC-P0-014 | Security baseline | Confirm no real secrets are committed | Search tracked files for actual passwords/keys before each commit. | Only `.env.example` has local example values; `.env` is ignored and never committed. |
| TC-P0-015 | Regression | Run automated tests | Run `mvn --batch-mode verify`. | Build succeeds and all JUnit tests pass. |

### Useful PowerShell API checks

```powershell
Invoke-RestMethod http://localhost:8080/api/v1
Invoke-RestMethod http://localhost:8080/actuator/health
Invoke-RestMethod http://localhost:8080/actuator/health/readiness
```

To test a custom request ID:

```powershell
Invoke-WebRequest http://localhost:8080/api/v1 -Headers @{ "X-Request-Id" = "test-request-001" }
```

## Phase 1 — Modules 1–3 ready test cases; Modules 4–5 planned

The Module 1 through Module 3 cases below are ready after restarting the backend. The remaining Phase 1 module cases become runnable when their modules are implemented.

### Module 1 — Identity and Access

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-AUTH-001 | Register with valid name, email, and password after first calling `GET /api/v1/auth/csrf` and supplying the CSRF header/token. | User is created; password is never returned in a response. |
| TC-AUTH-002 | Register with an email already in use. | HTTP 409 with a stable error code. |
| TC-AUTH-003 | Register with an invalid email/weak password. | HTTP 400 with field-level validation details. |
| TC-AUTH-004 | Log in with valid credentials. | Secure session cookie is issued; `GET /me` returns the correct user. |
| TC-AUTH-005 | Log in with an incorrect password. | HTTP 401; no account details leak. |
| TC-AUTH-006 | Log out, then call a protected endpoint. | Session is invalidated; protected call returns HTTP 401. |
| TC-AUTH-007 | Make a cookie-authenticated write without valid CSRF protection. | Request is rejected. |
| TC-AUTH-008 | Exceed login rate limit. | Further requests are throttled with HTTP 429. |

> TC-AUTH-001 through TC-AUTH-006 are implemented now. TC-AUTH-007 and TC-AUTH-008 are security hardening work to complete before public deployment; CSRF is already active, while explicit rate limiting is scheduled with Redis integration.

### Automated identity suite

`AuthControllerIntegrationTest` starts its own temporary PostGIS container and verifies registration, CSRF handling, authenticated `/me`, logout, re-login, and validation errors. This is a full integration suite and is deliberately excluded from the fast default test command. Run it in Docker-capable CI or a local terminal with Docker Desktop running:

```powershell
mvn --batch-mode -Pintegration verify
```

The test container and its test data are removed automatically after the test run; it does not use or alter the normal Vezlist Docker database.

### Module 2 — Users and Profiles

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-PROFILE-001 | Read own profile while authenticated. | Returns own editable profile data. |
| TC-PROFILE-002 | Update own profile with valid data. | Changes persist after a new login/session. |
| TC-PROFILE-003 | Update profile with invalid email or phone. | HTTP 400 with field errors. |
| TC-PROFILE-004 | Read and change notification/privacy preferences, then sign in on another device. | The saved values are returned on both devices. |
| TC-PROFILE-005 | Change password using an incorrect current password. | HTTP 400 with `CURRENT_PASSWORD_INVALID`; password remains unchanged. |
| TC-PROFILE-006 | Change password using the correct current password. | HTTP 204; other sessions are revoked and the current session remains signed in. |
| TC-PROFILE-007 | Request account deletion twice. | HTTP 202 both times; one pending, auditable request exists and data is not hard-deleted. |
| TC-PROFILE-008 | Inspect application logs after registration/login/password change. | No raw password appears; request representations show `[REDACTED]`. |

> Public seller privacy is verified when the public seller endpoint is introduced in Module 8. Module 2 exposes private profile fields only through the authenticated `/me` resource.

### Automated profile suite

`UserProfileRequestValidationTest` and `SensitiveRequestLoggingTest` run with the fast default suite. `UserProfileControllerIntegrationTest` runs against a temporary PostGIS container and covers the complete profile, preferences, password, and deletion-request HTTP flow:

```powershell
mvn --batch-mode test
mvn --batch-mode -Pintegration verify
```

### Module 3 — Categories and Locations

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-CATALOG-001 | Request Marketplace categories. | Returns only Marketplace-allowed categories. |
| TC-CATALOG-002 | Request Personals categories. | Returns only Personals-allowed categories. |
| TC-CATALOG-003 | Create a listing with an invalid category/location pair. | HTTP 400; invalid combination is rejected. |
| TC-CATALOG-004 | Request province and area data. | Results match seeded Canadian location data. |

`CatalogControllerIntegrationTest` verifies the V5 migration, public access, one-hour cache headers, all 13 Canadian provinces/territories, eight popular areas, invalid site handling, and Marketplace/Personals category isolation. `CatalogServiceTest` verifies rejection of cross-site categories and invalid location pairs. `ListingControllerIntegrationTest` exercises TC-CATALOG-003 through the Module 4 HTTP write endpoint.

```powershell
mvn --batch-mode test
mvn --batch-mode -Pintegration verify
```

### Module 4 — Listings

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-LIST-001 | Create a valid listing draft. | HTTP 201; listing belongs to the current user and starts as `DRAFT`. |
| TC-LIST-002 | Create a listing missing required fields. | HTTP 400 with field details. |
| TC-LIST-003 | Submit a complete draft. | Status changes to `PENDING_REVIEW`; event/audit entry is created. |
| TC-LIST-004 | Edit own draft. | Update persists. |
| TC-LIST-005 | Edit/delete another user's listing. | HTTP 403 or 404; no change occurs. |
| TC-LIST-006 | Retry create and submit with the same idempotency keys. | The same listing/result is returned and no duplicate is created. |
| TC-LIST-007 | Reuse a create idempotency key with a different payload. | HTTP 409; the original listing remains unchanged. |
| TC-LIST-008 | Read own listing detail before activation. | Owner can read it; another user receives HTTP 404. |
| TC-LIST-009 | Retrieve My Ads with listings from both sites. | Only listings matching the requested site are returned. |
| TC-LIST-010 | Delete own listing. | HTTP 204; the soft-deleted listing disappears from detail and My Ads. |

### Automated listing suite

`ListingControllerIntegrationTest` runs against temporary PostGIS and covers V6 migration, create/retry/conflict, validation, ownership, site isolation, update, submit/retry, detail visibility, My Ads, and soft deletion. Frontend unit tests cover draft validation and API payload/response mapping.

```powershell
mvn --batch-mode -Pintegration verify
cd ../Frontend
npm test
```

### Module 5 — Media

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-MEDIA-001 | Request an upload URL for own draft. | Short-lived, listing-scoped upload permission is returned. |
| TC-MEDIA-002 | Request an upload URL for another user's listing. | Request is rejected. |
| TC-MEDIA-003 | Attach one valid image. | Image is recorded and available after processing. |
| TC-MEDIA-004 | Attach more than six images. | Seventh image is rejected. |
| TC-MEDIA-005 | Upload an unsupported file type/oversized image. | Upload is rejected before public visibility. |
| TC-MEDIA-006 | Reorder images and select a cover. | Positions persist and cover is correct in listing response. |
| TC-MEDIA-007 | Complete an upload after its signed authorization expires. | HTTP 409; the stale media reservation and object are removed. |
| TC-MEDIA-008 | Delete a listing that has uploaded images. | Database records and stored objects are removed. |
| TC-MEDIA-009 | Upload bytes whose signature or checksum differs from the request. | Media becomes `REJECTED`, receives no delivery URL, and the object is removed. |
| TC-MEDIA-010 | Refresh and reopen a draft containing ready media. | The gallery, order, and cover reload from persisted API data. |

### Automated media suite

`ImageInspectorTest` verifies byte limits, signatures, and SHA-256 inspection. `ListingMediaControllerIntegrationTest` covers authorization, ownership, validation, the six-image limit, asynchronous processing, ordering/cover selection, expiry, deletion, and listing cleanup. Frontend tests cover checksum generation and ready-only response mapping.

```powershell
mvn --batch-mode test
mvn --batch-mode -Pintegration verify
cd ../Frontend
npm test
npm run build:all
```

## Phase 2 — Ready and planned test cases

### Module 6 — Discovery

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-DISC-001 | Search active listings by title. | Relevant active listings are returned with cursor pagination. |
| TC-DISC-002 | Apply category, area, price, verified, and date filters together. | Every returned listing matches every selected filter. |
| TC-DISC-003 | Request `nearest` sorting with valid coordinates. | Results are ordered by database-calculated distance. |
| TC-DISC-004 | Follow the next cursor. | No duplicate or skipped result across pages. |
| TC-DISC-005 | Search Personals scope from Marketplace request. | No cross-site data is returned. |

### Automated discovery suite

`DiscoveryCursorCodecTest` covers opaque cursor round trips, filter binding, sort binding, and malformed values. `DiscoveryControllerIntegrationTest` runs against temporary PostGIS and covers Flyway V8, combined filters, active/status and site isolation, every cursor page without duplicates or missing rows, price order, validation, query metrics, bounded radius, map projection, and database-calculated distance.

```powershell
mvn -Ddebug=false -Pintegration -Dtest=DiscoveryControllerIntegrationTest verify
cd ../Frontend
npm test
npm run build:all
```

### Module 7 — Saved Listings

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-SAVED-001 | Save an active listing. | Save is persisted and appears in the saved list. |
| TC-SAVED-002 | Save the same listing twice. | Only one saved record exists; request remains idempotent. |
| TC-SAVED-003 | Remove a saved listing. | It disappears from saved results. |
| TC-SAVED-004 | Save a deleted or inaccessible listing. | Request is rejected or the listing is omitted safely. |

### Module 8 — Seller and Reputation

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-SELLER-001 | View a public seller profile. | Safe public data and active listings are shown. |
| TC-SELLER-002 | View seller profile after their listing expires. | Expired listing is not public. |
| TC-SELLER-003 | Attempt to set own verified badge. | Request is forbidden; only moderation/admin can change it. |

## Phase 3 — Planned test cases

### Modules 9–11 — Moderation, Notifications, and Support

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-MOD-001 | User submits listing for review. | Listing enters the correct review state. |
| TC-MOD-002 | Moderator approves/rejects a listing. | State change is authorized, audited, and notifies the owner. |
| TC-MOD-003 | Normal user calls moderator endpoint. | HTTP 403. |
| TC-NOTIFY-001 | User receives listing-status notification. | Notification persists and unread count increases. |
| TC-NOTIFY-002 | Mark one/all notifications read. | Read state persists after refresh. |
| TC-SUPPORT-001 | Create a support ticket. | Ticket is owned by creator and is visible in their list. |
| TC-SUPPORT-002 | Reply to own ticket. | Reply persists and support notification is created. |
| TC-SUPPORT-003 | Read/reply to another user's ticket. | HTTP 403 or 404. |

## Phase 4 — Planned test cases

### Module 12 — Billing and Credits

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-BILL-001 | Create payment setup through provider-hosted flow. | Vezlist receives only a provider token and display-safe card metadata. |
| TC-BILL-002 | Process the same payment webhook twice. | User receives credits exactly once. |
| TC-BILL-003 | Buy a promotion without enough credits. | Purchase is rejected; no promotion is created. |
| TC-BILL-004 | Promote a listing with enough credits. | Immutable debit entry and promotion record are created together. |
| TC-BILL-005 | Refund a payment. | Ledger reversal is recorded and balances reconcile. |

## Phase 5 — Planned test cases

### Module 13 — Personals Stories

| ID | Test case | Expected result |
| --- | --- | --- |
| TC-STORY-001 | Eligible Personals user creates a story. | Story is scoped to Personals and has a 24-hour expiry. |
| TC-STORY-002 | Marketplace request attempts to retrieve Personals story. | No story data is returned. |
| TC-STORY-003 | View a story more than once. | View tracking is idempotent per viewer/story. |
| TC-STORY-004 | Request a story after expiry. | It is not returned publicly. |
| TC-STORY-005 | Disable stories through feature flag. | Story endpoints are unavailable while Marketplace remains healthy. |

## Regression checklist before every release

1. Run `mvn --batch-mode verify`.
2. Run all ready tests for the modules changed by the release.
3. Verify authentication, authorization, validation, site-scope isolation, and error responses for every new endpoint.
4. Test one successful flow and one failure/permission flow for every new feature.
5. Confirm Flyway migrations run on an empty database and upgrade a copy of the prior schema safely.
6. Confirm no secret, credential, card number, or personal contact data appears in logs or API responses unintentionally.
