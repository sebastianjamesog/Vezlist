# Deploying Frontend-New to Cloudflare

> **Staging only:** this folder uses the isolated `vezlist-new-*` Worker and
> R2 names declared in each `wrangler.jsonc`. Do not attach the current
> production domains. Admin and batch deployment are disabled until Spring
> Boot staff authentication is integrated. Follow `MIGRATION.md` for cutover.

Three apps, three Workers, one repo. `apps/marketplace` becomes the
`vezlist-new-marketplace` Worker, `apps/personals` becomes
`vezlist-new-personals`, and `apps/admin` becomes `vezlist-new-admin` — the
moderation console, which nothing on either public site
links to. Each is a full Next.js server — SSR, route handlers and ISR all run
inside the Worker via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), not a static
export.

Everything below is already committed. This is the account-side setup you do
once, then the deploy command you run every time.

---

## What you need

|                 |                                                                                   |
| --------------- | --------------------------------------------------------------------------------- |
| Node            | 22+ (built and verified on 24)                                                    |
| Cloudflare plan | Workers **Paid** ($5/mo) — the free plan has no R2                                |
| Domain          | Optional. `*.workers.dev` works, see [Custom domains](#5-custom-domains-optional) |

Install once:

```bash
npm install
```

---

## 1. Log in

```bash
npx wrangler login
```

Opens a browser and writes the token to your machine. Confirm it took:

```bash
npx wrangler whoami
```

On CI there is no browser — use an API token instead, see [CI](#ci).

---

## 2. Create the three R2 buckets

Prerendered HTML and ISR payloads live in R2, not in the Worker bundle. That is
what makes a revalidate a bucket write instead of a redeploy. The bindings are
already declared in each `wrangler.jsonc`; the buckets themselves have to exist.

```bash
npx wrangler r2 bucket create vezlist-new-marketplace-next-cache
npx wrangler r2 bucket create vezlist-new-personals-next-cache
npx wrangler r2 bucket create vezlist-new-admin-next-cache
```

If R2 has never been used on the account, the dashboard asks you to enable it
first (Dashboard → R2 → _Enable_). It is included in the Paid plan; the cache
is small enough to sit inside the free tier.

Skipping this step does not break the build — it breaks the deploy, with
`bucket not found`.

---

## 3. Deploy

From the repo root:

```bash
npm run deploy
npm run deploy:personals
```

That is `opennextjs-cloudflare build && opennextjs-cloudflare deploy` for each
app in turn. First run takes a few minutes; after that the Next build cache
makes it much faster.

One site at a time:

```bash
npm run deploy              # marketplace only
npm run deploy:personals    # personals only
npm run deploy:admin        # blocked until backend staff auth is connected
```

Each deployed public app gets an isolated `*.workers.dev` URL. Admin remains
local-only until Spring Boot staff authentication replaces the mock session.

---

## 4. Point the two sites at each other

The sites link across origins — the Personals tile on the marketplace home, the
"back to Vezlist" exit in the personals top bar, the age gate's "Leave" link.
Those URLs come from `packages/shared/src/lib/sites.js`, which falls back to
`https://vezlist.cc` / `https://personals.vezlist.cc`.

**This is already done for the current deployment.** Both apps carry an
`.env.production` naming the live workers:

```ini
NEXT_PUBLIC_MARKETPLACE_URL=https://vezlist-new-marketplace.vezlistofficial.workers.dev
NEXT_PUBLIC_PERSONALS_URL=https://vezlist-new-personals.vezlistofficial.workers.dev
```

Both public files hold **both** URLs — each site needs to know where the other
one is. `apps/admin/.env.production` holds those two plus its own
`NEXT_PUBLIC_ADMIN_URL`: the console links out to both boards from its rail and
names them on `/settings`, and its own URL is what `metadataBase` resolves
against. They are committed on purpose: public hostnames, not secrets.

The thing to know before you change them: these are `NEXT_PUBLIC_*`, so Next
inlines them **at build time**. Setting them as Worker variables in the
dashboard does nothing at all, and a redeploy without a rebuild ships the old
values. Edit the file, then deploy each approved public app separately.

Get one wrong and the cross-site links break while both sites otherwise look
perfectly fine — worth clicking the Personals tile once after every deploy, or:

```bash
curl -s https://vezlist-new-marketplace.vezlistofficial.workers.dev/ | grep -o 'href="http[^"]*workers.dev[^"]*"'
```

`next dev` ignores `.env.production` entirely, so local development keeps using
the `localhost:3100` / `localhost:3101` defaults.

## 5. Custom domains (cutover only)

Do not perform this section during development. Attaching the current domains
switches user traffic and requires a separate cutover review.

Add the domain to Cloudflare first (Dashboard → _Add a site_), then give each
Worker its hostname. Either through the dashboard — Workers & Pages → the
Worker → Settings → Domains & Routes → _Add_ → Custom Domain — or by declaring
it in the config.

`apps/marketplace/wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "vezlist.cc", "custom_domain": true }]
```

`apps/personals/wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "personals.vezlist.cc", "custom_domain": true }]
```

`apps/admin/wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "admin.vezlist.cc", "custom_domain": true }]
```

Cloudflare creates the DNS record and issues the certificate. Redeploy to apply.

Separate hostnames is a requirement, not a preference: the age gate and
discreet-mode flags are `localStorage`, which is per-origin. One hostname would
leak the marketplace session into personals and let the age gate be bypassed by
visiting the marketplace first.

The console leans on the same property for the opposite reason. The two public
sites share one account through a cookie on the parent domain, but the admin
session is deliberately `localStorage` on `admin.vezlist.cc` — so a signed-in
shopper arriving at the console is not a signed-in moderator. Do not move the
console onto a path of either public hostname; that is the thing that would
break it.

---

## Preview a production build locally

Runs the real Worker under `workerd` with real R2 bindings from `.wrangler/` —
much closer to production than `next dev`:

```bash
npm run preview              # marketplace
npm run preview:personals    # personals
npm run preview:admin        # console
```

---

## Rolling back a bad deploy

**Do this first, read afterwards.** A rollback is one command and it takes
effect across every route and custom domain immediately:

```bash
cd apps/marketplace          # or apps/personals, or apps/admin
npx wrangler rollback
```

With no argument that deploys the version uploaded immediately _before_ the
current one, which is what you want when the deploy you just ran is the
problem. Wrangler asks for confirmation and offers to record a reason; `-m
"reverting the promote regression"` supplies it up front and `-y` skips the
prompt, which is what you want in a script.

To go back further than one version, look first and then name the one you
want:

```bash
npx wrangler versions list           # the 10 most recent, newest first
npx wrangler rollback <VERSION_ID>
```

Cloudflare keeps the **100 most recent versions** available to roll back to, so
"the last known-good deploy" is almost always still there. `wrangler
deployments list` shows which version each past deployment actually served, if
you need to map "Tuesday's build" to an id.

Each app is its own Worker, so a rollback is per app. Roll back the one that
broke; there is no repo-wide command and there should not be, because the three
deploy independently.

### What a rollback does and does not restore

A version is the Worker code **and** its static assets, so rolling back
restores the bundle and everything under `.open-next/assets` together. It does
**not** touch anything outside the Worker:

- **The R2 cache is not versioned.** Prerendered HTML and ISR payloads written
  by the bad version stay in the affected `vezlist-new-*-next-cache` bucket
  until they revalidate. If the
  bug was in a prerendered page, roll back _and_ purge the object — see
  "Deploy succeeds, pages are stale" below.
- **Cross-site URLs are baked in at build time** (step 4). Rolling back
  restores whatever `NEXT_PUBLIC_MARKETPLACE_URL` and friends were set to when
  that version was _built_.
- **Bindings and secrets are current, not historical.** A rollback to a version
  that expected a binding you have since removed will deploy and then fail at
  runtime.

### Redeploying a known-good commit instead

Rollback is faster and needs no build, so prefer it. Rebuild from a commit when
the bad version is older than the retained window, or when you need a code
change rather than a revert:

```bash
git checkout <known-good-sha>
npm ci
npm run deploy        # or deploy:personals / deploy:admin
```

Then get back onto a branch — a deploy from a detached HEAD is easy to forget
you are sitting in.

> Verified against `wrangler` 4.125.0, the version pinned in this repo:
> `npx wrangler rollback --help` lists `[version-id]`, `--name`, `-m/--message`
> and `-y/--yes`, and `npx wrangler versions --help` lists `list`. Re-check with
> `--help` rather than trusting this paragraph after a major wrangler bump.

---

## Payments (Paybis)

Buying a credit pack goes through **Paybis**, a fiat-to-crypto on-ramp: the
buyer pays with a card or a bank transfer, Paybis runs the KYC and the
settlement, and the money arrives in the payout address on your Paybis
account. Nothing about that touches this repo's cards screen — `PaymentMethods`
saves a card for display, Paybis collects the one that gets charged.

Three pieces:

| Piece                            | Where                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| The rules and the trust boundary | `packages/shared/src/lib/paybis.js` (+ its tests)                                                 |
| The half that holds the key      | `packages/shared/src/server/paybisRequest.js`, mounted at `POST /api/paybis/request` in both apps |
| The widget in the buy modal      | `packages/shared/src/components/wallet/PaybisCheckout.jsx`                                        |

A purchase runs: the browser posts a **pack id** → the route prices that pack
from `creditPacks` and calls `POST /v2/quote` then `POST /request/v2` with the
API key → the `requestId` comes back → the Web SDK embeds the checkout on it →
Paybis redirects the frame to `/paybis/return`, which posts the outcome up to
the wallet.

The price never travels through the browser, and neither does the key or the
payout address. That is the whole reason there is a route handler rather than a
widget opened straight from the client.

**Turning it on.** Everything is off until an API key exists, and that is a
supported state: with `PAYBIS_API_KEY` unset the route answers
`{ configured: false }` and the modal says Paybis is not connected on this
build instead of opening a checkout it cannot finish. To connect one:

```bash
npx wrangler secret put PAYBIS_API_KEY --name vezlist
npx wrangler secret put PAYBIS_API_KEY --name vezlist-personals
```

Then set the non-secret half as Worker variables (Dashboard → the Worker →
Settings → Variables), or leave them at their defaults:

```
PAYBIS_ENVIRONMENT=sandbox        # only the exact string "production" is production
PAYBIS_FIAT_CURRENCY=USD
PAYBIS_CRYPTO_CURRENCY=USDT-TRC20 # the network matters: TRC20 ≠ ERC20 to a payout address
PAYBIS_PAYMENT_METHOD=credit_card
```

These are read at **request** time, not build time — unlike the `NEXT_PUBLIC_*`
pair above, changing one is a redeploy of variables, not `npm run build`.
`apps/*/.env.example` documents the same list for local runs.

Two things to confirm with Paybis before going live, because the public docs do
not pin them down:

- **Request signing.** `PAYBIS_SECRET_KEY` turns on `X-Signature` /
  `X-Timestamp` (HMAC-SHA256 over `timestamp + body`). Confirm the preimage
  against the credential pack Paybis issues with the key; leave the variable
  unset and the call goes out bearer-authenticated only, which is what their
  documented `curl` does when signing is not enabled on the account.
- **Sandbox first.** `widget.sandbox.paybis.com` cannot move real money, and it
  is where the whole flow — including a declined card and a closed widget —
  should be walked before the string `production` is typed anywhere.

**What is deliberately missing: the webhook.** `POST /webhooks/paybis` is what
actually settles a purchase — it is the only signal that the money arrived, and
in production it is the only thing that should move a balance. It needs a
durable place to write that balance to, and this build keeps the wallet in a
cookie on the buyer's own machine, so the credit currently happens in the
browser off the widget's own return message (narrowed by origin in
`readReturnMessage`). A webhook handler that verified a signature and then had
nowhere to put the result would be theatre. It lands with the database, and
`Wallet.jsx` carries the marker comment for where.

---

## Error tracking

Every uncaught error has two halves and they are collected differently.

**Server-side** — anything that throws inside the Worker — needs no setup.
`apps/*/instrumentation.js` exports Next's `onRequestError` hook, which fires
with the real error, the route pattern (`/ad/[id]`, not the one id that broke)
and the router kind, and writes one structured line. Cloudflare collects it:
turn on **Workers Logs** for each Worker (Dashboard → the Worker → Logs →
_Enable_) and it is queryable there, with `wrangler tail` for a live stream
while you are debugging:

```bash
npx wrangler tail --name vezlist
```

**Client-side** — a component that throws in the browser — never reaches the
Worker at all, so it has to be sent somewhere. The six error boundaries
(`apps/*/app/error.jsx` and `apps/*/app/global-error.jsx`) call `reportError`
from `apps/*/lib/observability.js`, which posts a Sentry event if a DSN is
configured and otherwise logs and returns.

To turn it on, add the DSN to each app's `.env.production`:

```
NEXT_PUBLIC_SENTRY_DSN=https://<publicKey>@<org>.ingest.sentry.io/<projectId>
NEXT_PUBLIC_ENVIRONMENT=production
```

A DSN is a public value by design — it is meant to ship in a client bundle —
so it is not a secret and does not belong in `wrangler secret`. It is read at
**build** time, so set it before `npm run deploy`, not after.

Give the console and personals their own Sentry projects and do those two
first: they carry the moderation queue and the 18+ board, which is where an
unnoticed break costs the most.

`observability.js` is a transport, not the Sentry SDK: no dependency, ~60 lines,
and it sends the message, the route, the stack and Next's error `digest` — the
digest being what lets a client report be matched to the Worker log line that
has the server-side stack. What it does not give you is source-mapped frames,
breadcrumbs or tracing. When those are worth a large dependency inside the
Worker bundle, `@sentry/nextjs` is the upgrade and Sentry documents the
OpenNext/Workers setup it needs; the six call sites do not change.

---

## Analytics

Use **Cloudflare Web Analytics**, and turn it on in the dashboard rather than in
this repo: Dashboard → Analytics & Logs → Web Analytics → _Add a site_, once per
hostname. For a hostname proxied through Cloudflare (orange-cloud, which a
Worker custom domain always is) the beacon is injected at the edge — no script
tag, no npm package, no consent banner for third-party cookies, and nothing to
redeploy.

That is the whole reason it is the choice here. Every script-tag vendor —
PostHog, Mixpanel, GA — is a runtime dependency, a client bundle cost and a
privacy-policy change, bought for numbers nobody has yet said they need. This
repo does not add a chart library or a table library either; an analytics SDK
is the same call.

Workers Analytics (requests, errors, CPU time, per Worker) is already on and
needs nothing.

---

## Uptime checks

Three origins, three checks. Cloudflare Health Checks (Dashboard → Traffic →
Health Checks) covers it with no code:

| Worker              | Check                                | Expect                                 |
| ------------------- | ------------------------------------ | -------------------------------------- |
| `vezlist`           | `GET https://vezlist.cc/`            | 200, body contains `Browse categories` |
| `vezlist-personals` | `GET https://personals.vezlist.cc/`  | 200                                    |
| `vezlist-admin`     | `GET https://admin.vezlist.cc/login` | 200, body contains `Work email`        |

The console is checked on `/login` rather than `/`, because `/` redirects when
there is no session and a redirect is not evidence that the app rendered.

A body match matters more than a status code here: an OpenNext Worker that
boots but cannot reach R2 still answers 200 on a lot of routes. Checking for a
string the page only contains when it actually rendered is what catches that.

---

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull
request and on every push to `main`, in two jobs.

**Test, lint, and build** — `npm ci`, then `npm test`, `npx oxlint`,
`npm run format:check` and `npm run build:all`.

`npm test` is both test suites in sequence: `npm run test:unit` (`node --test`,
the pure-function tests over `packages/shared/src/lib/*.js`) followed by
`npm run test:components` (Vitest + React Testing Library over every
`*.test.jsx`). Two runners, one command — the file extension is the whole
boundary between them, so neither can pick up the other's files and neither can
be skipped by forgetting a script. `npm run test:watch` is the Vitest watcher
during development.

**End-to-end flows** — `npx playwright install chromium`, then
`npm run test:e2e`: posting an ad, spending credits to promote one, and
moderating a listing in the console, driven against real `next dev` servers.
It is a separate job because the browser download and two servers make it the
slowest thing in the pipeline, so it runs beside the build rather than after
it. On failure the HTML report is uploaded as an artifact.

A PR cannot merge while any of that fails.

There is no deploy job. Deploys stay manual and isolated: once CI is green,
run the approved public app command from your own machine per
[step 3](#3-deploy). Admin and `deploy:all` remain blocked until backend staff
authentication and the final cutover review are complete.

---

## What is already configured

You should not need to touch these, but this is what they do.

**`apps/*/wrangler.jsonc`** — Worker name, `.open-next/worker.js` as the entry,
`.open-next/assets` as the static asset directory, and the R2 cache binding.
`compatibility_flags` carries `nodejs_compat` (the Next server needs Node
built-ins) and `global_fetch_strictly_public`.

**`apps/*/open-next.config.ts`** — selects the R2 incremental cache.

**`apps/*/next.config.mjs`** — `transpilePackages: ["@vezlist/shared"]` because
the shared package ships `.jsx` source rather than a build, `NEXT_PUBLIC_SITE`
to tell the two builds apart, and `images.unoptimized: true`. The Workers
adapter only serves `/_next/image` when the project defines a Cloudflare
Images binding or a custom loader hitting `/cdn-cgi/image`, and neither is
provisioned here, so the default loader would 404 in production;
`unoptimized` keeps `next/image`'s lazy loading and layout-stable sizing
without depending on either. See the comment in any of the three configs for
what flipping that back on would take.

---

## When it goes wrong

**The deploy went out and production is broken** — stop reading and roll back:
`cd apps/<app> && npx wrangler rollback`. That is one command, it needs no
build, and it is live everywhere immediately. Diagnose afterwards, from a
working site. Everything else on this page is a smaller problem than this one.
See [Rolling back a bad deploy](#rolling-back-a-bad-deploy).

**`bucket not found` on deploy** — step 2 was skipped, or the bucket name in
`wrangler.jsonc` does not match the one you created.

**`Cannot find module 'node:...'` at runtime** — `nodejs_compat` is missing from
`compatibility_flags`, or `compatibility_date` is older than `2024-09-23`.

**Cross-site links go to the wrong host** — step 4. Remember these are baked in
at build time, so you must rebuild, not just restart the Worker. The symptom is
a Personals tile that leaves for a domain you don't own.

**Personals renders in the light theme** — `NEXT_PUBLIC_SITE` did not reach the
build. Check `apps/personals/next.config.mjs` still sets it to `personals`.

**The console bounces straight back to `/login`** — expected on a hostname you
have not signed in on before. The admin session is per-origin `localStorage`, so
signing in on the preview URL does not sign you in on the deployed one. Sign in
again; any password of eight characters is accepted, because nothing on a server
is checking it.

**The console still shows old data after a `mock.js` edit** — its state is
seeded once and then persisted under `vezlist:admin:v1`. Hit **Reset to seed** on
`/settings`, or bump the version in that key.

**Deploy succeeds, pages are stale** — that is the R2 cache doing its job. Purge
it with `npx wrangler r2 object delete` or just let the revalidate window pass.
