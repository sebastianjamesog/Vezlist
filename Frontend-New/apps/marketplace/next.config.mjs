/** @type {import("next").NextConfig} */
const nextConfig = {
  // @vezlist/shared ships .jsx source, not a build, so Next has to compile it.
  transpilePackages: ["@vezlist/shared"],
  env: { NEXT_PUBLIC_SITE: "marketplace" },
  // `unoptimized` rather than the default loader: this app deploys through
  // OpenNext to Cloudflare Workers, and the Workers adapter only serves
  // `/_next/image` when the project defines a Cloudflare Images binding or a
  // custom loader hitting `/cdn-cgi/image` — both of which require enabling
  // Cloudflare Images on the zone, a product/billing decision nothing in this
  // repo has made yet (no `images` binding in wrangler.jsonc). Shipping the
  // default loader without either would 404 in production. `next/image`
  // still buys automatic lazy loading, async decoding and layout-stable
  // sizing with this flag on; it gives up responsive `srcSet` and AVIF/WebP
  // negotiation until one of those is provisioned, at which point flipping
  // this to `false` and adding a `loaderFile` is the only other change
  // needed — every call site already passes `sizes`.
  // `remotePatterns` is dropped rather than left dead: it only gates the
  // optimizer's default loader, which `unoptimized` bypasses entirely.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

// Serves the dev bindings (R2 cache and friends) from .wrangler on `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
