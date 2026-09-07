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
