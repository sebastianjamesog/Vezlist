# Frontend-New migration plan

`Frontend-New` is developed beside the current `Frontend`. The existing app
stays available until every migrated module passes its API and browser checks.

## Safety boundary

- Existing apps stay on ports 3000 and 3001.
- New Marketplace, Personals, and Admin use ports 3100, 3101, and 3102.
- New Cloudflare workers and R2 caches use `vezlist-new-*` names.
- No current production domain is attached before cutover review.
- Admin deployment is disabled while its session is backed by mock data.

## Current state

The three Next.js applications and shared design system are present. Their
production builds and UI tests run, but much of the product state still comes
from `data/mock.js`, cookies, or localStorage. The API client in
`packages/shared/src/lib/api.js` is the boundary for the existing Spring Boot
API; screens migrate to it in the phases below.

## Migration phases

| Phase | Modules                                          | Exit condition                                                                                                      |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 0     | Workspace safety and API foundation              | Three apps run beside the old frontend, builds pass, deploy targets cannot overwrite it, API/CSRF client is tested. |
| 1     | Identity and profiles (Modules 1-2)              | Marketplace and Personals use Spring sessions; Admin requires a real staff role; mock credentials are removed.      |
| 2     | Catalog, listings, and media (Modules 3-5)       | Create/edit/My Ads/detail/upload flows persist through the backend on both public apps.                             |
| 3     | Discovery, saved listings, sellers (Modules 6-8) | Browse, Nearby, Saved and Seller screens use site-scoped API data with complete async states.                       |
| 4     | Moderation and notifications (Modules 9-10)      | User report/appeal/inbox flows and the Admin moderation queue use backend permissions and durable data.             |
| 5     | Support (Module 11)                              | Ticket and FAQ mocks are replaced after the backend module exists.                                                  |
| 6     | Billing and stories (Modules 12-13)              | Provider-hosted billing and server-expiring Personals stories replace browser-only prototypes.                      |
| 7     | Cutover                                          | Regression, accessibility, live API and production builds pass; staging is approved before domain switching.        |

## Per-module development loop

1. Confirm the Spring OpenAPI contract and site/role rules.
2. Replace one mock-backed context or screen group with the shared API client.
3. Handle loading, error, empty and success states.
4. Add focused unit/component coverage and a live API browser journey where the
   module crosses authentication, storage or permissions.
5. Run `npm test`, `npm run lint`, `npm run format:check`, and
   `npm run build:all`.
6. Review the migrated module before starting the next one.

## Phase 0 commands

```powershell
cd E:\Works\vezlist\Frontend-New
npm.cmd run dev
npm.cmd run dev:personals
npm.cmd run dev:admin
```

Open `http://localhost:3100`, `http://localhost:3101`, and
`http://localhost:3102` in separate browser tabs.
