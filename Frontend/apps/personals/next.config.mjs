/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir: process.env.VEZLIST_E2E_DIST_DIR ?? ".next",
  // @vezlist/shared ships .jsx source, not a build, so Next has to compile it.
  transpilePackages: ["@vezlist/shared"],
  env: { NEXT_PUBLIC_SITE: "personals" },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
};

export default nextConfig;

// Serves the dev bindings (R2 cache and friends) from .wrangler on `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
