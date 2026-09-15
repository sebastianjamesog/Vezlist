/**
 * The two things every spec has to do before it can test anything: be signed
 * in, and have a balance.
 *
 * Both are written straight into storage rather than driven through the sign-in
 * screen. The session is a cookie on the parent domain and the wallet is
 * another (see `lib/cookieStore.js`), and there is no server issuing either —
 * so seeding them is not a shortcut around a real login, it *is* the login,
 * minus four keystrokes that would be re-tested on every spec. The sign-in
 * screen has its own spec.
 */

/** A one-pixel PNG, so the wizard's photo step has a real file to read. */
export const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Seed a signed-in creator with a balance, before the first navigation.
 *
 * `addInitScript` rather than `context.addCookies` for the wallet and session
 * both, so the values are in place before any React effect reads them on the
 * very first paint — a cookie added after `goto` would only be seen on a
 * reload.
 */
export async function signInAsCreator(page, { balance = 500 } = {}) {
  const session = {
    name: "Test Poster",
    email: "poster@example.com",
    role: "creator",
    signedInAt: "just now",
  };
  await page.addInitScript(
    ([user, wallet]) => {
      // Seed, do not overwrite. An init script runs on *every* navigation, so
      // writing unconditionally would silently top the wallet back up between
      // one route and the next — and a spec that spends credits and then walks
      // to the wallet screen to check the debit would pass no matter what the
      // app did.
      const has = (name) =>
        document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
      if (!has("vezlist_session")) {
        document.cookie = `vezlist_session=${encodeURIComponent(JSON.stringify(user))}; path=/`;
      }
      if (!has("vezlist_wallet")) {
        document.cookie = `vezlist_wallet=${encodeURIComponent(JSON.stringify(wallet))}; path=/`;
      }
    },
    [session, { balance, ledger: [] }],
  );
}

/** Seed a signed-in console session. The console uses localStorage, per origin. */
export async function signInAsAdmin(page, role = "moderator") {
  await page.addInitScript((who) => {
    localStorage.setItem("vezlist:admin:session:v1", JSON.stringify(who));
    // Start every spec from the seeded store — but only once. An init script
    // runs on every navigation, and clearing unconditionally would throw away
    // the moderation the spec just performed the moment it walked to the audit
    // log to check that it had been recorded. The marker is in
    // `sessionStorage`, which lives as long as this page's tab and no longer.
    if (!sessionStorage.getItem("e2e:seeded")) {
      sessionStorage.setItem("e2e:seeded", "1");
      localStorage.removeItem("vezlist:admin:v1");
    }
  }, admins[role]);
}

const admins = {
  owner: {
    id: "ad0",
    name: "Dana Whitfield",
    email: "dana@vezlist.cc",
    role: "owner",
    signedInAt: "just now",
  },
  moderator: {
    id: "ad1",
    name: "Priya Nair",
    email: "priya@vezlist.cc",
    role: "moderator",
    signedInAt: "just now",
  },
  support: {
    id: "ad2",
    name: "Sam Okafor",
    email: "sam@vezlist.cc",
    role: "support",
    signedInAt: "just now",
  },
};
