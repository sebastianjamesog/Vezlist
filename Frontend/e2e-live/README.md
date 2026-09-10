# Live notification browser smoke

This opt-in suite uses real Next.js UI, Spring session login/CSRF, the notification
API, and an isolated Postgres database. There is no HTTP interception. The only
local fixture acknowledges the Personals age gate for the adult test account.

From `Backend`, run:

```text
mvn -Pintegration -Dtest=NotificationBrowserIT test
```

Prerequisites: Docker/Testcontainers, installed frontend npm dependencies, and
Chrome or Playwright Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can override).
The Java harness provisions ephemeral credentials and two unread notifications per
site and launches `npm run test:browser:live`. It passes `VEZLIST_LIVE_API_BASE_URL`,
`VEZLIST_LIVE_EMAIL`, and `VEZLIST_LIVE_PASSWORD`; do not log their values or use a
shared account. The configuration accepts only a loopback HTTP API.

Marketplace/Personals start on ports 3200/3201 with `.next-live` output. Each site's
scenario verifies real login, badge count two, read-one persistence after reload,
then read-all persistence after reload, with response/site/CSRF assertions.

Trace, screenshots, video, and AI error-context page snapshots are disabled to
avoid recording login credentials. This suite is not included in the regular
[mocked browser regressions](../e2e/README.md), which use ports 3100/3101.
