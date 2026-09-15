"use client";

import { AuthProvider } from "@vezlist/shared/context/AuthContext.jsx";
import { AccountProvider } from "@vezlist/shared/context/AccountContext.jsx";
import { SavedProvider } from "@vezlist/shared/context/SavedContext.jsx";
import { StatusProvider } from "@vezlist/shared/context/StatusContext.jsx";
import { FeedProvider } from "@vezlist/shared/context/FeedContext.jsx";
import { ListingsProvider } from "@vezlist/shared/context/ListingsContext.jsx";
import { TicketsProvider } from "@vezlist/shared/context/TicketsContext.jsx";
import { ReportsProvider } from "@vezlist/shared/context/ReportsContext.jsx";
import { SearchProvider } from "@vezlist/shared/context/SearchContext.jsx";
import LocationSync from "@vezlist/shared/context/LocationSync.jsx";
import { DiscreetProvider } from "./useDiscreet";

/**
 * The state that has to outlive a screen. It sits in the root layout, which
 * Next keeps mounted across every navigation — including into the full-screen
 * status player, which is why the feed's filters survive closing a story.
 *
 * The locale and the location are the two things a visitor sets on one board
 * and expects to still hold on the other. Both ride in a cookie on the parent
 * domain, so both origins have to mount the pair that reads it — a provider
 * present on the marketplace and missing here would mean the crossing quietly
 * reset the language and the area every time. The same two wrappers, in the
 * same order, as apps/marketplace/app/providers.jsx.
 *
 * Only some of the app is translated so far — the board itself is not — but the
 * location bar is, and dropping the stored locale on arrival would be visible
 * there and nowhere else, which is the most confusing form the bug could take.
 *
 * ListingsProvider holds the ads this account has posted. It sits above the
 * shell because the create sheet writes to it from the layout while My Ads
 * reads it from a route — and it wraps DiscreetProvider rather than the other
 * way round because posting an ad is not a discreet-mode concern. TicketsProvider
 * is the same shape for support tickets — Tickets opens one from its route and
 * TicketDetail reads it from a different one — and sits beside it for the same
 * reason: neither depends on the other or on DiscreetProvider.
 *
 * ReportsProvider holds what this reader reported and who they blocked, and it
 * matters more on this board than on the other one: the live player is a
 * full-screen route that unmounts the shell, and the report control in it has
 * to be reading the same store as the board underneath.
 *
 * SearchProvider holds recent and saved searches — mounted here for the same
 * reason as `apps/marketplace/app/providers.jsx`: not yet wired into this
 * board's own search row, but present so the store and its `:v1` key exist
 * from the same place on both origins rather than only where a screen
 * happens to read it first.
 */
export default function Providers({ children }) {
  return (
    <AuthProvider>
      <AccountProvider>
        <SavedProvider>
          <StatusProvider>
            <FeedProvider>
              <LocationSync />
              <ListingsProvider>
                <TicketsProvider>
                  <ReportsProvider>
                    <SearchProvider>
                      <DiscreetProvider>{children}</DiscreetProvider>
                    </SearchProvider>
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
