import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { listings, photos } from './featured-data.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const composeArgs = ['compose', '--env-file', 'Backend/.env', '-f', 'Backend/compose.yml'];
const api = 'http://localhost:8080';
const dataset = 'featured-v1';

function docker(args, input) {
  const result = spawnSync('docker', args, { cwd: root, input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw new Error(`Docker could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Docker command failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function sql(query) {
  return docker([...composeArgs, 'exec', '-T', 'postgres', 'sh', '-c',
    'exec psql --no-psqlrc -v ON_ERROR_STOP=1 -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], query);
}

function uuid(value) {
  const bytes = createHash('sha256').update(`${dataset}:${value}`).digest();
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }));
}

function assertLoopback(value, label, protocol, port) {
  const url = new URL(value.replace(/^jdbc:/, ''));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.protocol !== protocol || url.port !== port) {
    throw new Error(`${label} must point to this project's local Docker service on port ${port}.`);
  }
}

async function getJson(path) {
  const response = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`API ${path} returned HTTP ${response.status}.`);
  return response.json();
}

async function photograph(key) {
  const cachePath = resolve(root, 'Backend/.seed-cache', `${key}.jpg`);
  let bytes;
  try { bytes = await readFile(cachePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(photos[key], { signal: AbortSignal.timeout(45000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('image/jpeg')) {
      throw new Error(`Could not download ${key} photograph (HTTP ${response.status}).`);
    }
    bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, bytes);
  }
  if (bytes.length < 1000 || bytes.length > 10 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`Invalid cached JPEG: ${cachePath}`);
  }
  return { bytes, checksum: createHash('sha256').update(bytes).digest('hex') };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run seed:featured\nCreates/refreshes 16 local database listings with photos and engagement.\nRequires npm run dev:all. Repeat runs reuse the same records and refresh feed eligibility.\nTest accounts have no usable login. Only local Docker PostgreSQL/MinIO are supported.');
    return;
  }
  if (args.length) throw new Error(`Unknown arguments: ${args.join(' ')}`);
  if (process.env.NODE_ENV === 'production') throw new Error('This seed command is for local development only.');
  const env = { ...parseEnv(await readFile(resolve(root, 'Backend/.env'), 'utf8')), ...process.env };
  assertLoopback(env.VEZLIST_DB_URL || 'jdbc:postgresql://localhost:5433/vezlist', 'Database', 'postgresql:', '5433');
  assertLoopback(env.VEZLIST_STORAGE_ENDPOINT || 'http://localhost:9000', 'Storage', 'http:', '9000');
  const context = process.env.DOCKER_HOST || docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  if (!context.startsWith('npipe:') && !context.startsWith('unix:')) throw new Error('Use a local Docker context for this seed command.');
  const bucket = env.VEZLIST_STORAGE_BUCKET || 'vezlist-media';
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid storage bucket name.');
  const health = await getJson('/actuator/health');
  if (health.status !== 'UP') throw new Error('Start the backend with npm run dev:all first.');
  if (sql("SELECT count(*) FROM flyway_schema_history WHERE version = '22' AND success;\n") !== '1') {
    throw new Error('Run the backend migrations through V22 before seeding.');
  }

  console.log('Seeding local PostgreSQL with realistic test ads and persisted save/view events.');
  console.log('Downloading/caching 8 real activity and scenery photographs from Unsplash...');
  const images = {};
  // Limit network pressure and avoid partially changing database rows if a photo fails.
  for (const key of Object.keys(photos)) images[key] = await photograph(key);
  docker([...composeArgs, 'exec', '-T', 'minio', 'sh', '-c',
    'mc alias set featuredseed http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mb --ignore-existing "featuredseed/$1" >/dev/null', 'sh', bucket]);

  const rows = [];
  for (const listing of listings) {
    const image = images[listing.photo];
    const objectKey = `seeds/${dataset}/${listing.slug}.jpg`;
    docker([...composeArgs, 'exec', '-T', 'minio', 'mc', 'pipe', '--attr', 'Content-Type=image/jpeg',
      `featuredseed/${bucket}/${objectKey}`], image.bytes);
    rows.push({ id: uuid(`listing:${listing.slug}`), owner_id: uuid(`owner:${listing.slug}`),
      media_id: uuid(`media:${listing.slug}`), ...listing, age_minutes: listing.ageMinutes,
      object_key: objectKey, photo_source: photos[listing.photo], size_bytes: image.bytes.length, checksum: image.checksum });
  }
  const readers = Array.from({ length: 8 }, (_, i) => ({ id: uuid(`reader:${i + 1}`), number: i + 1 }));
  const template = await readFile(new URL('./seed-featured.sql', import.meta.url), 'utf8');
  const query = template.replace(":'listings'", () => literal(JSON.stringify(rows)))
    .replace(":'readers'", () => literal(JSON.stringify(readers)));
  console.log(sql(query));

  // Exercise the actual feed builder, including cached rotation allocation.
  for (const feed of ['NEW_TODAY', 'TRENDING']) {
    const result = await getJson(`/api/v1/personals/featured?feed=${feed}`);
    if (!result.items?.length) throw new Error(`Seed saved, but ${feed} returned no cards.`);
    const image = result.items.find(item => item.imageUrl)?.imageUrl;
    if (image) {
      // S3 signs the HTTP method; a GET presign cannot be checked with HEAD.
      const response = await fetch(image, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`${feed} photo returned HTTP ${response.status}.`);
      await response.arrayBuffer();
    }
    console.log(`${feed}: ${result.items.length} cards returned by the backend`);
  }
  console.log('Ready: http://localhost:3001/featured/new and http://localhost:3001/featured/trending');
  console.log('Rerun npm run seed:featured to refresh today/recent-save timestamps without duplicating records.');
}

main().catch(error => { console.error(`Seed failed: ${error.message}`); process.exitCode = 1; });
