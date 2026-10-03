# Vezlist

Vezlist is a two-site classifieds platform with a shared Java Spring Boot API:

- `Frontend/apps/marketplace` — the Marketplace Next.js application.
- `Frontend/apps/personals` — the independently deployed Personals Next.js application.
- `Frontend/packages/shared` — shared UI, state, and API integration.
- `Backend` — the modular Spring Boot backend, PostgreSQL migrations, and local Docker services.

See [Backend/README.md](Backend/README.md) for backend setup and [Frontend/README.md](Frontend/README.md) for frontend development.

## Local development

Start the infrastructure and backend:

```powershell
cd Backend
Copy-Item .env.example .env
docker compose --env-file .env up -d
mvn spring-boot:run
```

In another terminal, start the Marketplace or Personals frontend:

```powershell
cd Frontend
npm install
npm run dev
# or: npm run dev:personals
```

## Local featured-feed test data

With `npm run dev:all` running, execute this command from the repository root:

```powershell
npm run seed:featured
```

It creates 16 realistic **test** Personals ads in PostgreSQL: eight candidates for
New Today and eight for Trending. The normal backend selects five per section.
Photos are real activity/scenery photographs stored in local MinIO. Saves and views
are persisted test events, so the cards and ranking use the regular API and database.
These are fictional advertisers, labeled `(Test)`, with non-deliverable contact
addresses and no usable login; they are not imported customer ads.

Rerun the command to refresh publication/save timestamps without duplicating data.
It preserves existing user listings and engagement, and rebuilds the current featured
rotation. It only supports this project's local Docker database and storage. Internet
access is needed for the first photo download; subsequent runs use the ignored
`Backend/.seed-cache/` directory. See `Backend/scripts/featured-data.mjs` for the
editable dataset and photo source URLs ([Unsplash license](https://unsplash.com/license)).

Open <http://localhost:3001/featured/new> or <http://localhost:3001/featured/trending>.
New Today uses the last 24 hours, Trending uses the last four hours of saves, and
the sections rotate every 15 minutes. Rerun the seed when testing on a later day.

## Stories

On Personals, open **Profile → Add a story** (Ads creator accounts only).
The flow is photo/video → pack and payment options → published confirmation.
Stories use backend uploads and expire after 24 hours; saved drafts can be resumed.

Administrators manage pack names, prices, currencies, story counts, availability,
and display order at <http://localhost:3002/story-plans>. Changes are saved in the
database. Default packs are Single Story (CAD 5) and 3 Stories Pack (CAD 12).

The payment gateway is intentionally disconnected. For local testing, set
`VEZLIST_STORY_DEMO_PURCHASES_ENABLED=true` in `Backend/.env` and restart the backend.
Creators can select **Demo purchase & publish** for any enabled pack without a
charge. Pack prices stay unchanged, demo publications are marked in the database,
and the remaining stories become reusable credits. This flag defaults to false;
with it off, paid stories stay drafts and zero-price packs can still publish.
No real payment is recorded. Story reactions remain device-only;
story viewer analytics are not implemented.

## Verification

```powershell
cd Backend
mvn test
mvn -Pintegration test

cd ../Frontend
npm test
npm run build
npm run build:personals
```
