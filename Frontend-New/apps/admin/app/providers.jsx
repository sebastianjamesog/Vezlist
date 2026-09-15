"use client";

import { AdminAuthProvider } from "@vezlist/shared/context/AdminAuthContext.jsx";
import { AdminDataProvider } from "@vezlist/shared/context/AdminDataContext.jsx";
import { ToastProvider } from "@vezlist/shared/context/ToastContext.jsx";

/**
 * Three providers, in the only order they work in.
 *
 * `AdminDataProvider` reads the signed-in admin to stamp the audit log, so it
 * has to sit inside `AdminAuthProvider`. Toast sits innermost because both of
 * the others fire toasts and neither reads one.
 *
 * The public `SavedProvider` / `StatusProvider` / `FeedProvider` are not here:
 * a moderator has no saved ads and no feed filters.
 */
export default function Providers({ children }) {
  return (
    <AdminAuthProvider>
      <AdminDataProvider>
        <ToastProvider>{children}</ToastProvider>
      </AdminDataProvider>
    </AdminAuthProvider>
  );
}
