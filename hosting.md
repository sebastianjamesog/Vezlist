# Hosting Vezlist on a Linux VPS

Updated: 17 October 2026.

This guide puts **Marketplace, Personals, Admin, the Java backend, PostgreSQL/PostGIS, Redis, and image/story storage on your VPS**. Gcore remains the external live video provider. Cloudflare Workers, Vercel, and R2 are not required for this setup; you can still use Cloudflare for DNS.

This is a deployment runbook and configuration template, not evidence of an existing public deployment. Replace the example domains and secrets, create the files shown below, and perform the acceptance checks before opening registration. The examples assume Ubuntu 24.04 LTS on an x86-64 VPS, Docker Compose, and host-installed Nginx. Adapt installation commands for another distribution or CPU architecture.

## 1. What runs where

| Component | Public address in this guide | Private destination |
| --- | --- | --- |
| Marketplace | `https://vezlist.cc` | `127.0.0.1:3000` |
| Personals | `https://personals.vezlist.cc` | `127.0.0.1:3001` |
| Admin | `https://admin.vezlist.cc` | `127.0.0.1:3002` |
| Backend API and live WebSockets | `https://api.vezlist.cc` | `127.0.0.1:8080` |
| Private S3-compatible media storage | `https://media.vezlist.cc` | `127.0.0.1:9000` |
| Storage administration | SSH tunnel only | `127.0.0.1:9001` |
| PostgreSQL/PostGIS | None | Docker network, port 5432 |
| Redis | None | Docker network, port 6379 |

Nginx accepts public HTTPS requests and forwards them to the appropriate service. Keeping the sites and API under the same parent domain simplifies the existing browser session flow. Frontend requests include credentials; the API remains responsible for authorization.

Live video travels along this path:

```text
Creator camera -> secure WebSocket -> VPS backend / FFmpeg -> Gcore -> viewers
Viewer / creator chat -> secure WebSocket -> VPS backend -> Redis
Photos and stories -> signed upload URL -> VPS object storage
```

Gcore delivers live playback directly to viewers. The VPS still encodes each creator's stream, so concurrent broadcasters consume CPU and outbound bandwidth. Live recording and DVR remain disabled; uploaded stories are separate stored files. Chat messages are ephemeral and are cleared when a live session ends.

### Capacity planning

For a small initial deployment, budget roughly 8 vCPU, 16 GB RAM, and SSD storage with room for uploads, Docker images, and backups. This is a planning estimate, not measured capacity. A smaller VPS may be adequate for a limited test; validate it with your actual streams. Building three Next.js apps on the live server also consumes memory and CPU.

The current backend defaults to **four concurrent broadcasts per node** and **2,000 chat connections per node**. These are admission limits, not throughput guarantees. Start with a conservative broadcast limit and load-test before increasing it. Monitor disk space especially closely when storing media on the VPS.

## 2. Prepare the server and DNS

You need:

- A VPS with SSH access and a non-root deployment user with sudo access.
- A domain with editable DNS records.
- A Gcore Streaming account/token with the required permissions.
- An off-server location for database and media backups.
- The complete application revision you intend to release, including the current live UI and Gcore changes. Uncommitted local changes will not appear in a server Git clone.

Create DNS A records for `vezlist.cc`, `personals`, `admin`, `api`, and `media`, all pointing to the VPS IPv4 address. Add AAAA records only if IPv6 reaches this VPS correctly. Start with DNS-only records when using Cloudflare; proxying can be considered after direct HTTPS and live streaming work.

Install Docker Engine and its Compose plugin using the [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Install the host tools:

```bash
sudo apt update
sudo apt install -y git nginx certbot python3-certbot-nginx openssl
sudo systemctl enable --now docker nginx
sudo docker version
sudo docker compose version
```

Allow your actual SSH port and TCP 80/443 in the VPS provider firewall. Keep a working SSH session open while changing firewall rules. Database, Redis, application, and storage-console ports should not be publicly accessible. The Compose file below binds application ports to loopback and publishes no database/Redis ports. Docker port publishing can bypass UFW rules, so do not rely on UFW alone. [Docker firewall notes](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)

Directory layout:

```text
/srv/vezlist/
  repo/                  Git checkout
  deploy/compose.yml     VPS deployment configuration
  secrets/runtime.env    Backend secrets and Compose settings
  data/media/            Persistent object storage data
  backups/               Temporary local backup copies
```

Create the directories and clone your repository as your deployment user:

```bash
sudo install -d -o "$USER" -g "$(id -gn)" /srv/vezlist/repo /srv/vezlist/deploy
sudo install -d -m 700 /srv/vezlist/secrets /srv/vezlist/backups
sudo install -d -m 700 -o 65532 -g 65532 /srv/vezlist/data/media
git clone YOUR_GITHUB_REPOSITORY_URL /srv/vezlist/repo
```

If `repo/` already contains a checkout, use it instead of cloning over it. Use SSH keys or a credential manager for repository access; do not embed GitHub tokens in clone URLs.

## 3. Prepare the frontend for Node.js hosting

Each app already has `next build` and `next start` scripts. Its `deploy` script targets Cloudflare, so **use production build/start commands for this VPS deployment**. Next.js supports Node.js hosting behind a reverse proxy. [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)

Before creating the production image, review these files:

- `Frontend/apps/marketplace/next.config.mjs`
- `Frontend/apps/personals/next.config.mjs`
- `Frontend/apps/admin/next.config.mjs`

Each currently invokes the OpenNext development helper. Replace its unconditional import/call at the bottom with this development-only form, leaving the existing Next.js configuration intact:

```javascript
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}
```

This is a preparation step described by this guide; writing this document did not change those files. Keep the existing OpenNext files if you want to retain a Cloudflare deployment option. Ordinary `next build`/`next start` do not use the OpenNext R2 cache configuration. The Node server needs writable local Next.js cache directories, which the image below provides.

### Create `Frontend/.dockerignore`

Merge these exclusions if the file already exists. Do not copy Windows dependencies, build output, or local secrets into the Linux image.

```dockerignore
**/node_modules
**/.next
**/.open-next
**/.wrangler
**/.env*
**/.dev.vars*
**/*.log
.git
test-results
playwright-report
```

### Create `Frontend/Dockerfile.vps`

This intentionally builds one image containing all three apps and uses it for three separate containers. It retains build dependencies and prioritizes a straightforward first deployment over minimal image size. A smaller multi-stage runtime image can be introduced after this deployment is verified.

```dockerfile
FROM node:24-bookworm-slim
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
COPY --chown=node:node . .
USER node
RUN npm ci

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STORAGE_URL
ARG NEXT_PUBLIC_MARKETPLACE_URL
ARG NEXT_PUBLIC_PERSONALS_URL
ARG NEXT_PUBLIC_ADMIN_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_STORAGE_URL=${NEXT_PUBLIC_STORAGE_URL} \
    NEXT_PUBLIC_MARKETPLACE_URL=${NEXT_PUBLIC_MARKETPLACE_URL} \
    NEXT_PUBLIC_PERSONALS_URL=${NEXT_PUBLIC_PERSONALS_URL} \
    NEXT_PUBLIC_ADMIN_URL=${NEXT_PUBLIC_ADMIN_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build:all
ENV NODE_ENV=production
EXPOSE 3000 3001 3002
CMD ["npm", "run", "start"]
```

All `NEXT_PUBLIC_*` values are public and embedded at build time. Changing a hostname requires rebuilding the frontend image. Never use public build arguments for Gcore, database, or storage secrets. [Next.js environment guidance](https://nextjs.org/docs/app/guides/self-hosting#environment-variables)

The backend already has `Backend/Dockerfile`, which builds Java 21 and installs FFmpeg. Add a `Backend/.dockerignore` excluding `.env`, `.env.*`, `target`, `.local-tools`, `.seed-cache`, and `*.log` before building it. Existing dependency image tags are a starting point; record the tested image digests for a repeatable release and review updates deliberately.

## 4. Configure secrets and public addresses

Create `/srv/vezlist/secrets/runtime.env` with `sudoedit`, then set permissions to `600`:

```bash
sudoedit /srv/vezlist/secrets/runtime.env
sudo chmod 600 /srv/vezlist/secrets/runtime.env
```

Template; replace every `REPLACE_...` value. Generate separate random credentials, for example with `openssl rand -hex 32`. Do not commit this file. Compose supports its own interpolation rules; hex credentials avoid accidental `$` expansion.

```dotenv
RELEASE_TAG=initial
VEZLIST_DB_NAME=vezlist
VEZLIST_DB_USERNAME=vezlist
VEZLIST_DB_PASSWORD=REPLACE_DATABASE_PASSWORD
VEZLIST_DB_URL=jdbc:postgresql://postgres:5432/vezlist

VEZLIST_REDIS_HOST=redis
VEZLIST_REDIS_PORT=6379
VEZLIST_REDIS_PASSWORD=REPLACE_REDIS_PASSWORD

VEZLIST_CORS_ALLOWED_ORIGINS=https://vezlist.cc,https://personals.vezlist.cc,https://admin.vezlist.cc
VEZLIST_CORS_ALLOW_LOCAL_PATTERNS=false

VEZLIST_STORAGE_ENDPOINT=https://media.vezlist.cc
VEZLIST_STORAGE_REGION=us-east-1
VEZLIST_STORAGE_BUCKET=vezlist-media
VEZLIST_STORAGE_ACCESS_KEY=REPLACE_STORAGE_APPLICATION_ACCESS_KEY
VEZLIST_STORAGE_SECRET_KEY=REPLACE_STORAGE_APPLICATION_SECRET_KEY
STORAGE_ADMIN_USER=REPLACE_STORAGE_ADMIN_USER
STORAGE_ADMIN_PASSWORD=REPLACE_STORAGE_ADMIN_PASSWORD

VEZLIST_GCORE_API_TOKEN=REPLACE_GCORE_STREAMING_TOKEN
VEZLIST_FFMPEG_PATH=/usr/bin/ffmpeg
VEZLIST_LIVE_BROADCAST_WS_URL=wss://api.vezlist.cc/api/v1/live/broadcast
VEZLIST_LIVE_CHAT_WS_URL=wss://api.vezlist.cc/api/v1/live/chat
VEZLIST_LIVE_MAX_BROADCASTS_PER_NODE=2
VEZLIST_LIVE_MAX_CHAT_CONNECTIONS_PER_NODE=2000
VEZLIST_LIVE_DEMO_PURCHASES_ENABLED=false
VEZLIST_STORY_DEMO_PURCHASES_ENABLED=false
VEZLIST_SEED_ADMIN=false

SERVER_SERVLET_SESSION_COOKIE_SECURE=true
SERVER_SERVLET_SESSION_COOKIE_HTTP_ONLY=true
SERVER_SERVLET_SESSION_COOKIE_SAME_SITE=lax
SPRINGDOC_API_DOCS_ENABLED=false
SPRINGDOC_SWAGGER_UI_ENABLED=false
MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=health,info

NEXT_PUBLIC_API_URL=https://api.vezlist.cc
NEXT_PUBLIC_STORAGE_URL=https://media.vezlist.cc
NEXT_PUBLIC_MARKETPLACE_URL=https://vezlist.cc
NEXT_PUBLIC_PERSONALS_URL=https://personals.vezlist.cc
NEXT_PUBLIC_ADMIN_URL=https://admin.vezlist.cc

STORAGE_IMAGE=cgr.dev/chainguard/minio@sha256:c93745c56fccdaf0e5dcb88999a96a65a136428beb045ef5d546255a80d747a7
```

The storage image above is the exact image used successfully in local development on 17 October 2026. It is a deployment candidate, not a claim of long-term support or a security audit. Confirm it is available for your VPS architecture and review its maintenance/support before public launch. The old image in `Backend/compose.yml` failed to download locally; do not silently reuse that development Compose file. The example runs storage as its non-root UID 65532 with a pre-owned data directory.

Use `STORAGE_ADMIN_*` only for the storage container. Do not add `VEZLIST_MINIO_ROOT_USER` or `VEZLIST_MINIO_ROOT_PASSWORD` to the API environment: the current backend configuration gives those names precedence over `VEZLIST_STORAGE_*` application credentials.

The backend uses the storage endpoint both for server operations and signed browser URLs. It must therefore be a reachable HTTPS address, not `http://minio:9000`. Verify the VPS itself can reach `https://media.vezlist.cc` through its public DNS/firewall.

## 5. Create `/srv/vezlist/deploy/compose.yml`

This is a new production file; it does not replace `Backend/compose.yml` used for development. Docker has automatic restarts and bounded logs. Postgres and Redis are private to the Compose network. The API secret file is not mounted in the frontend containers.

```yaml
name: vezlist

x-runtime: &runtime
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"

services:
  postgres:
    <<: *runtime
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: ${VEZLIST_DB_NAME:?required}
      POSTGRES_USER: ${VEZLIST_DB_USERNAME:?required}
      POSTGRES_PASSWORD: ${VEZLIST_DB_PASSWORD:?required}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    <<: *runtime
    image: redis:7-alpine
    environment:
      REDIS_PASSWORD: ${VEZLIST_REDIS_PASSWORD:?required}
    command: ["sh", "-c", "exec redis-server --requirepass \"$$REDIS_PASSWORD\""]
    healthcheck:
      test: ["CMD-SHELL", "REDISCLI_AUTH=$$REDIS_PASSWORD redis-cli ping | grep -q PONG"]
      interval: 10s
      timeout: 5s
      retries: 10

  storage:
    <<: *runtime
    image: ${STORAGE_IMAGE:?required}
    user: "65532:65532"
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: ${STORAGE_ADMIN_USER:?required}
      MINIO_ROOT_PASSWORD: ${STORAGE_ADMIN_PASSWORD:?required}
      MINIO_API_CORS_ALLOW_ORIGIN: ${VEZLIST_CORS_ALLOWED_ORIGINS:?required}
    volumes:
      - /srv/vezlist/data/media:/data
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"

  api:
    <<: *runtime
    image: vezlist-api:${RELEASE_TAG:?required}
    build:
      context: /srv/vezlist/repo/Backend
    environment:
      VEZLIST_DB_URL: ${VEZLIST_DB_URL:?required}
      VEZLIST_DB_USERNAME: ${VEZLIST_DB_USERNAME:?required}
      VEZLIST_DB_PASSWORD: ${VEZLIST_DB_PASSWORD:?required}
      VEZLIST_REDIS_HOST: redis
      VEZLIST_REDIS_PORT: "6379"
      VEZLIST_REDIS_PASSWORD: ${VEZLIST_REDIS_PASSWORD:?required}
      VEZLIST_CORS_ALLOWED_ORIGINS: ${VEZLIST_CORS_ALLOWED_ORIGINS:?required}
      VEZLIST_CORS_ALLOW_LOCAL_PATTERNS: "false"
      VEZLIST_STORAGE_ENDPOINT: ${VEZLIST_STORAGE_ENDPOINT:?required}
      VEZLIST_STORAGE_REGION: ${VEZLIST_STORAGE_REGION:?required}
      VEZLIST_STORAGE_BUCKET: ${VEZLIST_STORAGE_BUCKET:?required}
      VEZLIST_STORAGE_ACCESS_KEY: ${VEZLIST_STORAGE_ACCESS_KEY:?required}
      VEZLIST_STORAGE_SECRET_KEY: ${VEZLIST_STORAGE_SECRET_KEY:?required}
      VEZLIST_GCORE_API_TOKEN: ${VEZLIST_GCORE_API_TOKEN:?required}
      VEZLIST_FFMPEG_PATH: /usr/bin/ffmpeg
      VEZLIST_LIVE_BROADCAST_WS_URL: ${VEZLIST_LIVE_BROADCAST_WS_URL:?required}
      VEZLIST_LIVE_CHAT_WS_URL: ${VEZLIST_LIVE_CHAT_WS_URL:?required}
      VEZLIST_LIVE_MAX_BROADCASTS_PER_NODE: ${VEZLIST_LIVE_MAX_BROADCASTS_PER_NODE:-2}
      VEZLIST_LIVE_MAX_CHAT_CONNECTIONS_PER_NODE: ${VEZLIST_LIVE_MAX_CHAT_CONNECTIONS_PER_NODE:-2000}
      VEZLIST_LIVE_DEMO_PURCHASES_ENABLED: ${VEZLIST_LIVE_DEMO_PURCHASES_ENABLED:-false}
      VEZLIST_STORY_DEMO_PURCHASES_ENABLED: ${VEZLIST_STORY_DEMO_PURCHASES_ENABLED:-false}
      VEZLIST_SEED_ADMIN: "false"
      SERVER_SERVLET_SESSION_COOKIE_SECURE: "true"
      SERVER_SERVLET_SESSION_COOKIE_HTTP_ONLY: "true"
      SERVER_SERVLET_SESSION_COOKIE_SAME_SITE: lax
      SPRINGDOC_API_DOCS_ENABLED: "false"
      SPRINGDOC_SWAGGER_UI_ENABLED: "false"
      MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE: health,info
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "127.0.0.1:8080:8080"
    stop_grace_period: 45s

  marketplace:
    <<: *runtime
    image: vezlist-frontend:${RELEASE_TAG:?required}
    build:
      context: /srv/vezlist/repo/Frontend
      dockerfile: Dockerfile.vps
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:?required}
        NEXT_PUBLIC_STORAGE_URL: ${NEXT_PUBLIC_STORAGE_URL:?required}
        NEXT_PUBLIC_MARKETPLACE_URL: ${NEXT_PUBLIC_MARKETPLACE_URL:?required}
        NEXT_PUBLIC_PERSONALS_URL: ${NEXT_PUBLIC_PERSONALS_URL:?required}
        NEXT_PUBLIC_ADMIN_URL: ${NEXT_PUBLIC_ADMIN_URL:?required}
    command: ["npm", "run", "start", "--workspace=@vezlist/marketplace", "--", "--hostname", "0.0.0.0"]
    ports:
      - "127.0.0.1:3000:3000"

  personals:
    <<: *runtime
    image: vezlist-frontend:${RELEASE_TAG:?required}
    command: ["npm", "run", "start", "--workspace=@vezlist/personals", "--", "--hostname", "0.0.0.0"]
    ports:
      - "127.0.0.1:3001:3001"

  admin:
    <<: *runtime
    image: vezlist-frontend:${RELEASE_TAG:?required}
    command: ["npm", "run", "start", "--workspace=@vezlist/admin", "--", "--hostname", "0.0.0.0"]
    ports:
      - "127.0.0.1:3002:3002"

volumes:
  postgres-data:
    name: vezlist-postgres-data
```

Compose passes only the listed application settings to the API; storage administration credentials stay with the storage container. Production cookie, seeding, and documentation-exposure settings are fixed in the Compose template, so editing their duplicate entries in `runtime.env` does not override those fixed values.

Redis holds transient live data, so this example intentionally does not persist it. A Redis restart can disrupt chat and broadcasts. Account sessions are stored in PostgreSQL by the current backend. This single-VPS setup has a single point of failure; restart policies do not provide high availability.

For the remaining commands, define this Bash helper in your SSH session. Recreate it after reconnecting:

```bash
dc() {
  sudo docker compose \
    --env-file /srv/vezlist/secrets/runtime.env \
    -f /srv/vezlist/deploy/compose.yml "$@"
}
dc config --quiet
dc up -d postgres redis storage
dc build api
dc up -d api
dc logs --tail=100 api
curl --fail http://127.0.0.1:8080/actuator/health
```

`config --quiet` validates the file without printing expanded secrets. Flyway applies database migrations on API startup. A successful health response does not establish that storage or Gcore is working; test those separately below.

## 6. Configure Nginx and HTTPS

Create `/etc/nginx/conf.d/vezlist-upgrade.conf` in Nginx's HTTP context:

```nginx
map $http_upgrade $vezlist_upgrade {
    default upgrade;
    '' close;
}
```

Create `/etc/nginx/snippets/vezlist-proxy.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Port $server_port;
proxy_set_header Forwarded "";
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $vezlist_upgrade;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
proxy_buffering off;
```

The proxy replaces incoming forwarding headers so callers cannot impersonate the trusted HTTPS proxy. If another trusted proxy is introduced later, configure its real-IP handling explicitly. Upgrade headers and long timeouts are required for the live connections. [Nginx WebSocket documentation](https://nginx.org/en/docs/http/websocket.html)

Create `/etc/nginx/sites-available/vezlist`:

```nginx
server {
    listen 80;
    server_name vezlist.cc;
    client_max_body_size 20m;
    location / {
        include snippets/vezlist-proxy.conf;
        proxy_pass http://127.0.0.1:3000;
    }
}
server {
    listen 80;
    server_name personals.vezlist.cc;
    client_max_body_size 20m;
    location / {
        include snippets/vezlist-proxy.conf;
        proxy_pass http://127.0.0.1:3001;
    }
}
server {
    listen 80;
    server_name admin.vezlist.cc;
    client_max_body_size 20m;
    location / {
        include snippets/vezlist-proxy.conf;
        proxy_pass http://127.0.0.1:3002;
    }
}
server {
    listen 80;
    server_name api.vezlist.cc;
    client_max_body_size 20m;
    location = /actuator/health {
        include snippets/vezlist-proxy.conf;
        proxy_pass http://127.0.0.1:8080;
    }
    location /actuator { return 404; }
    location / {
        include snippets/vezlist-proxy.conf;
        proxy_pass http://127.0.0.1:8080;
    }
}
server {
    listen 80;
    server_name media.vezlist.cc;
    client_max_body_size 100m;
    # Signed URLs are credentials; avoid writing their query strings to logs.
    access_log off;
    location / {
        include snippets/vezlist-proxy.conf;
        proxy_request_buffering off;
        proxy_pass http://127.0.0.1:9000;
    }
}
```

The storage proxy preserves the hostname and path used by S3 signing. Do not rewrite signed URLs or add blanket public caching to API/auth/media responses. The proxy upload limit is only an upper bound; application media limits still apply.

Enable the site and obtain certificates after DNS resolves to the VPS:

```bash
sudo ln -s /etc/nginx/sites-available/vezlist /etc/nginx/sites-enabled/vezlist
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx --redirect \
  -d vezlist.cc -d personals.vezlist.cc -d admin.vezlist.cc \
  -d api.vezlist.cc -d media.vezlist.cc
sudo certbot renew --dry-run
```

If the symlink already exists, do not recreate it. Certbot adds TLS configuration and HTTP redirects; confirm its renewal timer is enabled. Frontend URLs may return 502 until the frontend containers start. HTTPS is needed for public browser camera/microphone access. [Ubuntu TLS certificate guide](https://ubuntu.com/server/docs/how-to/security/obtain-tls-certificates/)

## 7. Initialize private media storage

Open an SSH tunnel from your computer:

```bash
ssh -L 9001:127.0.0.1:9001 YOUR_SSH_USER@YOUR_VPS_IP
```

Visit `http://localhost:9001` and sign in using `STORAGE_ADMIN_USER` / `STORAGE_ADMIN_PASSWORD`.

1. Create a private bucket named `vezlist-media`.
2. Create an application user/access key restricted to that bucket. It needs bucket inspection/listing and object read/write/delete operations. Pre-creating the bucket avoids needing global bucket-creation permission.
3. Put its credentials in `VEZLIST_STORAGE_ACCESS_KEY` and `VEZLIST_STORAGE_SECRET_KEY` in `runtime.env`. Keep administration credentials separate.
4. Keep anonymous bucket access disabled. Existing code issues expiring signed upload/download URLs, including access to private media.
5. Recreate the API with `dc up -d --force-recreate api` so it loads the credentials.

The template configures exact browser origins through the storage server's CORS setting. Test an actual browser upload, including the preflight and the signed `Content-Type` / metadata headers. Do not fix a CORS failure by making the bucket public.

### Optional: use Gcore Object Storage instead

If you prefer managed storage while keeping all application servers on your VPS:

- Create a private Gcore bucket and scoped S3 credentials.
- Replace the backend endpoint, region, bucket, access key, and secret with the account's actual settings.
- Set `NEXT_PUBLIC_STORAGE_URL` to the browser-accessible storage origin and rebuild the frontends so their CSP permits it.
- Configure bucket CORS for the three frontend origins, allowing the required GET/HEAD/PUT requests and signed upload headers. Test signed PUT, HEAD, GET, and DELETE with the application's actual metadata.
- Omit the local storage service, console, and media proxy if they are no longer used. Preserve existing media before switching; changing an endpoint does not migrate files.

This is an optional alternative to the all-VPS storage setup. Gcore Streaming and Object Storage require separate configuration. Image Stack/CDN optimization would be an additional integration; the current app uses signed S3 URLs. [Gcore storage](https://gcore.com/storage), [Gcore Image Stack](https://gcore.com/image-stack)

## 8. Build and start the three frontends

Build after the API's public HTTPS endpoint is reachable, because server-rendered routes can request backend data while building.

```bash
dc build marketplace
dc up -d marketplace personals admin
dc ps
curl --fail -I https://vezlist.cc
curl --fail -I https://personals.vezlist.cc
curl --fail -I https://admin.vezlist.cc
curl --fail https://api.vezlist.cc/actuator/health
curl --fail https://api.vezlist.cc/api/v1/live/plans
```

The `marketplace` build creates the shared `vezlist-frontend:RELEASE_TAG` image with all three production builds. Containers run separate Node servers. Do not run the root `npm run dev:all` or `spring-boot:run` as production services.

Validate browser requests use the public API and media origins, not localhost or the old Workers domains. Check the API's session cookie is Secure and HttpOnly, requests include it, and login works from both public apps and the admin app. The API's host-only session cookie is sufficient when all three apps call that same API host; avoid broadening its domain unnecessarily. The CSRF cookie is intentionally readable in the existing implementation; do not confuse it with the authentication session cookie.

## 9. Create the first production administrator

Keep `VEZLIST_SEED_ADMIN=false`; the bundled seeder is described as local-development tooling. Register your own account through the application, verify its exact email/identity, then grant that account the ADMIN role using a controlled database session.

```bash
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Inside `psql`, replace the email with the account you just registered:

```sql
BEGIN;
SELECT id, email, enabled FROM app_users WHERE email = 'your-admin@example.com';
-- Continue only when this returns the one account you intend to promote.
INSERT INTO user_roles (user_id, role)
SELECT id, 'ADMIN' FROM app_users WHERE email = 'your-admin@example.com'
ON CONFLICT DO NOTHING;
SELECT u.email, r.role FROM app_users u JOIN user_roles r ON r.user_id = u.id
WHERE u.email = 'your-admin@example.com';
COMMIT;
```

If the selected account is wrong, use `ROLLBACK` instead of continuing. Sign out and back in so the session reloads roles. This procedure uses the current `app_users` / `user_roles` schema; do not grant staff access based only on an unverified user-supplied email. Record who performed the initial grant and when.

## 10. Live streaming and payment behavior

The Gcore token stays only on the backend. The backend image contains FFmpeg; confirm it starts:

```bash
dc exec api ffmpeg -version
```

The VPS needs outbound HTTPS access to Gcore's API and RTMPS ingest. Public WebSocket URLs must use `wss://` and exactly match `/api/v1/live/broadcast` and `/api/v1/live/chat`. Existing frontend CSP permits the API WebSocket origin and standard Gcore playback domains.

`streamingAvailable: true` in the plans response confirms local configuration, not successful provider authentication or actual broadcasting. Run a real broadcast from HTTPS, with a separate viewer browser/device, before launch. Verify sound/video, chat both ways, viewer counts, reconnect, automatic expiration, End Live, directory removal, and provider cleanup. Check recording/DVR stay disabled. Test from Canada and expected creator locations; the current browser bridge plus HLS playback is not sub-second WebRTC.

**The payment gateway remains deferred.** With demo purchases disabled, paid creator plans cannot complete a real purchase. For a public free trial, use an enabled zero-price live plan. For a controlled demo, explicitly enable `VEZLIST_LIVE_DEMO_PURCHASES_ENABLED=true`; it does not charge money. Story testing has its own demo flag. Viewers watch live for free either way. Do not describe demo purchases as successful real payments.

## 11. Backups and recovery

Back up PostgreSQL and media before the first real users arrive, then automate backups with monitoring. A Docker volume or a directory on the same VPS is not an off-server backup.

### PostgreSQL backup

Run in Bash with the `dc` helper defined. This produces a custom-format dump using the matching PostgreSQL client inside the container:

```bash
set -o pipefail
backup_name="vezlist-$(date -u +%Y%m%dT%H%M%SZ).dump"
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  | sudo tee "/srv/vezlist/backups/$backup_name" >/dev/null
sudo chmod 600 "/srv/vezlist/backups/$backup_name"
sudo test -s "/srv/vezlist/backups/$backup_name"
```

For automation, use a root-owned script with explicit Compose paths, `set -euo pipefail`, a scheduled systemd timer, and failure alerts. Copy completed dumps to encrypted off-server storage. A starting retention policy is seven daily copies and four weekly copies; adjust for recovery needs.

### Media and configuration

- Use an S3-aware backup/sync tool to copy objects to an independent backup destination. If taking a filesystem backup instead, quiesce uploads and stop storage before copying its data directory, then restart it. Never copy a changing object-store directory and assume it is consistent.
- Coordinate database and media recovery points. For a fully consistent snapshot, pause application writes during both backups.
- Back up deployment files and encrypted secrets separately. Keep access to those backups outside the VPS.
- Preserve the source revision and image tags/digests for each release. Do not prune images needed for rollback.

### Practice a restore

Restore into an isolated PostGIS database and a separate media bucket/directory. Use `pg_restore --exit-on-error` with a matching PostgreSQL version, then run the matching application revision and inspect accounts, listings, and media. Do not test by overwriting production. Successful backup creation alone does not establish recoverability.

## 12. Updates and rollback

For the first single-server setup, schedule a maintenance window. API replacement stops local encoders and interrupts active broadcasts; a normal Docker restart is not seamless live failover.

1. Finish or end active streams and pause writes for the backup window.
2. Take database/media backups and record the running revision and image tags.
3. Update the checkout to a reviewed revision, preserving the VPS Docker/config files. Run the project's required tests before release.
4. Set a new `RELEASE_TAG` in the secret file, preferably the Git commit SHA.
5. Build both images before replacing the running containers:

```bash
dc build api marketplace
dc up -d --no-deps api
dc logs --tail=100 api
curl --fail https://api.vezlist.cc/actuator/health
dc up -d --no-deps marketplace personals admin
```

6. Repeat login/upload/live smoke checks and monitor logs and resource usage.

Frontend public URL changes always need a rebuild. Backend secret changes need a container recreation (`dc up -d --force-recreate api`), not merely `docker restart`.

For application rollback, restore `RELEASE_TAG` to a retained image tag and recreate only the app services. First confirm the previous backend can run against the migrated schema. Flyway migrations are not automatically undone by changing an image. Restore a database backup only through a planned recovery procedure that accounts for writes since that backup.

Do not use `docker compose down -v`, volume pruning, or deletion of `/srv/vezlist/data` as a routine deployment step; these can remove production data.

## 13. Launch checks and troubleshooting

Before opening the site:

- All five domains have valid HTTPS and renewal works.
- Only intended public ports are reachable; storage console/database/Redis remain private.
- Registration, login/logout, refresh, and the Personals age gate work on the public domains.
- The intended admin can sign in; regular accounts cannot access staff API actions.
- Uploads, image reads, deletion, stories, and expired/private media behave correctly.
- Real live broadcasts and chat pass the checks in section 10 on mobile and desktop.
- Demo pricing behavior is intentional and visible to creators.
- Off-server backups and an isolated restore have been tested.
- CPU, RAM, disk, restart counts, certificate expiry, API failures, encoder failures, and backup failures are monitored.

Useful commands:

```bash
dc ps
dc logs --tail=100 api
dc logs --tail=100 personals
sudo docker stats --no-stream
df -h
sudo nginx -t
sudo journalctl -u nginx --since '30 minutes ago'
sudo systemctl list-timers --all
```

| Symptom | Check |
| --- | --- |
| Nginx 502 | Container status, correct loopback port, application startup logs |
| Frontend calls localhost | Rebuild with the public `NEXT_PUBLIC_API_URL`; check stale local env overrides |
| Login/CORS failures | Exact HTTPS origins, credentialed requests, session cookie, forwarded scheme |
| Camera unavailable | HTTPS, device permission, browser support |
| Live configuration warning | Gcore token, FFmpeg path, restarted API, plans response |
| Broadcast/chat fails to connect | WSS URL, proxy Upgrade headers, CSP, public API reachability |
| Broadcast works locally but fails on VPS | CPU/memory limits, FFmpeg/libx264, outbound Gcore connectivity |
| Signed upload fails | Browser-accessible storage endpoint, unchanged host/path, CORS, signed headers, system clock |
| Media disappears after restart | Correct persistent data mount, object keys/bucket, storage credentials |
| Disk usage keeps rising | Media growth, logs, retained images/backups; use deliberate retention |

Do not share raw secret files, complete signed URLs, stream keys, or full environment dumps when diagnosing a problem.

## 14. Details to settle before deployment

- Actual VPS OS, CPU architecture, vCPU/RAM/disk, and SSH port.
- Final domain names and DNS provider.
- Expected simultaneous creators and viewers.
- VPS object storage versus optional Gcore Object Storage, plus a maintained storage image choice.
- Where encrypted off-server backups will live and the acceptable recovery window.
- Whether launch uses free creator plans or a controlled demo while the payment gateway is deferred.

Once these are known, turn these templates into versioned deployment files, validate the images on that VPS, and run the launch checks. This guide does not change the local development setup or deploy any public resources.
