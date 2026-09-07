# Deploying Vezlist to Cloudflare

Two sites, two Workers, one repo. `apps/marketplace` becomes the `vezlist`
Worker and `apps/personals` becomes `vezlist-personals`. Each is a full Next.js
server — SSR, route handlers and ISR all run inside the Worker via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), not a static
export.

Everything below is already committed. This is the account-side setup you do
once, then the deploy command you run every time.

---

## What you need

|                 |                                                                                   |
| --------------- | --------------------------------------------------------------------------------- |
| Node            | 20+ (built and verified on 24)                                                    |
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

## 2. Create the two R2 buckets

Prerendered HTML and ISR payloads live in R2, not in the Worker bundle. That is
what makes a revalidate a bucket write instead of a redeploy. The bindings are
already declared in each `wrangler.jsonc`; the buckets themselves have to exist.

```bash
npx wrangler r2 bucket create vezlist-next-cache
npx wrangler r2 bucket create vezlist-personals-next-cache
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
npm run deploy:all
```

That is `opennextjs-cloudflare build && opennextjs-cloudflare deploy` for each
app in turn. First run takes a few minutes; after that the Next build cache
makes it much faster.

One site at a time:

```bash
npm run deploy              # marketplace only
npm run deploy:personals    # personals only
```

You get a `*.workers.dev` URL for each. Both are live immediately.

---

## 4. Point the two sites at each other

The sites link across origins — the Personals tile on the marketplace home, the
"back to Vezlist" exit in the personals top bar, the age gate's "Leave" link.
Those URLs come from `packages/shared/src/lib/sites.js`, which falls back to
`https://vezlist.cc` / `https://personals.vezlist.cc`.

**This is already done for the current deployment.** Both apps carry an
`.env.production` naming the live workers:

```ini
NEXT_PUBLIC_MARKETPLACE_URL=https://vezlist.vezlistofficial.workers.dev
NEXT_PUBLIC_PERSONALS_URL=https://vezlist-personals.vezlistofficial.workers.dev
```

Both files hold **both** URLs — each site needs to know where the other one is.
They are committed on purpose: public hostnames, not secrets.

The thing to know before you change them: these are `NEXT_PUBLIC_*`, so Next
inlines them **at build time**. Setting them as Worker variables in the
dashboard does nothing at all, and a redeploy without a rebuild ships the old
values. Edit the file, then `npm run deploy:all`.

Get one wrong and the cross-site links break while both sites otherwise look
perfectly fine — worth clicking the Personals tile once after every deploy, or:

```bash
curl -s https://vezlist.vezlistofficial.workers.dev/ | grep -o 'href="http[^"]*workers.dev[^"]*"'
```

`next dev` ignores `.env.production` entirely, so local development keeps using
the `localhost:3000` / `localhost:3001` defaults.

## 5. Custom domains (optional)

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

Cloudflare creates the DNS record and issues the certificate. Redeploy to apply.

Two separate hostnames is a requirement, not a preference: the age gate,
session and discreet-mode flags are all `localStorage`, which is per-origin. One
hostname would leak the marketplace session into personals and let the age gate
be bypassed by visiting the marketplace first.

---

## Preview a production build locally

Runs the real Worker under `workerd` with real R2 bindings from `.wrangler/` —
much closer to production than `next dev`:

```bash
npm run preview              # marketplace
npm run preview:personals    # personals
```

---

## CI

Generate an API token: Dashboard → My Profile → API Tokens → _Create Token_ →
**Edit Cloudflare Workers** template. It needs Workers Scripts: Edit and
Workers R2 Storage: Edit.

```yaml
- run: npm ci
- run: npm run deploy:all
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

`wrangler login` is not involved — the token is picked up from the environment.

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
to tell the two builds apart, and the `picsum.photos` remote image pattern.

---

## When it goes wrong

**`bucket not found` on deploy** — step 2 was skipped, or the bucket name in
`wrangler.jsonc` does not match the one you created.

**`Cannot find module 'node:...'` at runtime** — `nodejs_compat` is missing from
`compatibility_flags`, or `compatibility_date` is older than `2024-09-23`.

**Cross-site links go to the wrong host** — step 4. Remember these are baked in
at build time, so you must rebuild, not just restart the Worker. The symptom is
a Personals tile that leaves for a domain you don't own.

**Personals renders in the light theme** — `NEXT_PUBLIC_SITE` did not reach the
build. Check `apps/personals/next.config.mjs` still sets it to `personals`.

**Deploy succeeds, pages are stale** — that is the R2 cache doing its job. Purge
it with `npx wrangler r2 object delete` or just let the revalidate window pass.
