# Mocked browser smoke tests

Run `npm run test:browser` from `Frontend`. Playwright starts isolated Marketplace
and Personals development servers on ports 3100/3101, with `.next-e2e` build output.
It uses installed Chrome on Windows when available; otherwise install Chromium with
`npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

These tests exercise the actual rendered moderation and notification screens in
Chromium for both sites. Moderation coverage includes sign-in prompts, ownership
visibility, public review reasons, request bodies/site scope/CSRF, successful
reports/appeals, and API errors. Notification coverage includes guest isolation,
unread badges, read-one/read-all, reloads, empty/error/retry states, and pagination.

All API responses are mocked by Playwright. These are browser UI/integration smoke
tests, **not full end-to-end tests against the running Spring backend**. Database
persistence, authorization, moderation transitions, and privacy rules are covered
by the backend integration suite. No live accounts or listings are modified.

The separate [live notification smoke](../e2e-live/README.md) uses real Spring login,
CSRF, database persistence, and notification APIs with no HTTP interception. Run
it through the opt-in backend `NotificationBrowserIT` harness; it is excluded from
this default suite.
