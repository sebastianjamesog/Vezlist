"use client";

import { AuthProvider } from "@vezlist/shared/context/AuthContext.jsx";
import { SavedProvider } from "@vezlist/shared/context/SavedContext.jsx";
import { StatusProvider } from "@vezlist/shared/context/StatusContext.jsx";
import { FeedProvider } from "@vezlist/shared/context/FeedContext.jsx";
import { CatalogProvider } from "@vezlist/shared/context/CatalogContext.jsx";
import { DiscreetProvider } from "./useDiscreet";

/**
 * The state that has to outlive a screen. It sits in the root layout, which
 * Next keeps mounted across every navigation — including into the full-screen
 * status player, which is why the feed's filters survive closing a story.
 */
export default function Providers({ children }) {
  return (
    <CatalogProvider>
      <AuthProvider>
        <SavedProvider>
          <StatusProvider>
            <FeedProvider>
              <DiscreetProvider>{children}</DiscreetProvider>
            </FeedProvider>
          </StatusProvider>
        </SavedProvider>
      </AuthProvider>
    </CatalogProvider>
  );
}
