import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

/**
 * Prerendered pages and ISR payloads live in R2 rather than in the worker
 * bundle, so a revalidate is a write to the bucket instead of a redeploy.
 * The bucket is bound as NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
