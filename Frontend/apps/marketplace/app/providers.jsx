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

/**
 * The state that has to outlive a screen. It sits in the root layout, which
 * Next keeps mounted across every navigation — including into the full-screen
 * status player, which is why the feed's filters survive closing a story.
 *
 * LocationSync renders nothing and lives inside FeedProvider, whose filters it
 * both seeds and mirrors. It is shared with personals rather than written out
 * twice — the cookie behind it spans both origins, so a sync running on only
 * one of them would drop the location on the way across.
 *
 * ListingsProvider and TicketsProvider are innermost because nothing else
 * depends on either and neither depends on the other: ListingsProvider holds
 * the ads this account has posted, and it has to be above the shell rather
 * than inside a screen because the create sheet writes to it from the layout
 * while My Ads reads it from a route. TicketsProvider is the same shape for
 * support tickets — Tickets opens one from its route and TicketDetail reads
 * it from a different one, so both need it above them, not inside either.
 *
 * ReportsProvider holds what this reader reported and who they blocked. It
 * sits above the shell because a block is enforced on the feed while it is
 * placed from an ad or a profile two routes away, and because it must survive
 * the crossing into the full-screen routes that unmount everything else.
 *
 * SearchProvider holds recent and saved searches. It sits beside
 * ReportsProvider rather than inside the browse route itself for the same
 * reason FeedProvider does: opening a status story unmounts the whole shell,
 * and a search recorded a minute ago has to still be there when it closes.
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
                    <SearchProvider>{children}</SearchProvider>
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
