// Belt and suspenders on top of the `robots: { index: false, follow: false }`
// meta tag in app/layout.jsx: that tag only stops indexing of pages a
// crawler already fetched, so this keeps well-behaved bots from spending
// crawl budget on this origin at all. No sitemap — nothing here should be
// discoverable via search.
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
