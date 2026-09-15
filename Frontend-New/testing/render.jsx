import { render } from "@testing-library/react";
import { AuthProvider } from "@vezlist/shared/context/AuthContext.jsx";
import { AccountProvider } from "@vezlist/shared/context/AccountContext.jsx";
import { SavedProvider } from "@vezlist/shared/context/SavedContext.jsx";
import { StatusProvider } from "@vezlist/shared/context/StatusContext.jsx";
import { FeedProvider } from "@vezlist/shared/context/FeedContext.jsx";
import { ListingsProvider } from "@vezlist/shared/context/ListingsContext.jsx";
import { TicketsProvider } from "@vezlist/shared/context/TicketsContext.jsx";
import { ReportsProvider } from "@vezlist/shared/context/ReportsContext.jsx";
import { ToastProvider } from "@vezlist/shared/context/ToastContext.jsx";
import { AdminAuthProvider } from "@vezlist/shared/context/AdminAuthContext.jsx";
import { AdminDataProvider } from "@vezlist/shared/context/AdminDataContext.jsx";

/**
 * The public providers, in the order `apps/*\/app/providers.jsx` nests them.
 *
 * Every one of these contexts throws from its hook when the provider is
 * missing, so a page cannot be mounted without the stack — and the order is
 * load-bearing (Locale writes `lang`/`dir` before anything below it renders).
 * Duplicating it here rather than importing the app's `Providers` is
 * deliberate: `providers.jsx` lives in an app, imports through the
 * `@vezlist/shared` bare specifier, and pulling it in would make a test of the
 * shared package depend on which app happened to be built.
 *
 * `LocationSync` is left out. It renders nothing and only mirrors the location
 * cookie into the feed filters; in jsdom it would write a cookie on every
 * mount for no assertion's benefit.
 */
function PublicProviders({ children }) {
  return (
    <AuthProvider>
      <AccountProvider>
        <SavedProvider>
          <StatusProvider>
            <FeedProvider>
              <ListingsProvider>
                <TicketsProvider>
                  <ReportsProvider>
                    <ToastProvider>{children}</ToastProvider>
                  </ReportsProvider>
                </TicketsProvider>
              </ListingsProvider>
            </FeedProvider>
          </StatusProvider>
        </SavedProvider>
      </AccountProvider>
    </AuthProvider>
  );
}

/** The console's three, same order as `apps/admin/app/providers.jsx`. */
function AdminProviders({ children }) {
  return (
    <AdminAuthProvider>
      <AdminDataProvider>
        <ToastProvider>{children}</ToastProvider>
      </AdminDataProvider>
    </AdminAuthProvider>
  );
}

/** Render a public screen inside the provider stack the app gives it. */
export function renderApp(ui, options) {
  return render(ui, { wrapper: PublicProviders, ...options });
}

/** Render a console screen inside the provider stack the console gives it. */
export function renderAdmin(ui, options) {
  return render(ui, { wrapper: AdminProviders, ...options });
}

/**
 * Sign the browser in before a render.
 *
 * `AuthContext` and `AccountContext` both read a cookie on the parent domain
 * rather than localStorage, because the two public sites share one account.
 * Seeding the cookie directly — rather than driving the sign-in screen — is
 * what lets a test of My Ads be a test of My Ads.
 *
 * Must be called *before* `renderApp`: `usePersisted` reads the store once on
 * mount and only re-reads on focus.
 */
export function signIn({ role = "creator", ...rest } = {}) {
  const session = {
    name: "Test Poster",
    email: "poster@example.com",
    role,
    signedInAt: "just now",
    ...rest,
  };
  document.cookie = `vezlist_session=${encodeURIComponent(
    JSON.stringify(session),
  )}; path=/`;
  return session;
}

/** Put a known balance in the wallet cookie. Also before `renderApp`. */
export function seedWallet({ balance = 500, ledger = [] } = {}) {
  document.cookie = `vezlist_wallet=${encodeURIComponent(
    JSON.stringify({ balance, ledger }),
  )}; path=/`;
  return balance;
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
