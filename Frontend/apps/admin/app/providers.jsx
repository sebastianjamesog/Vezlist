"use client";

import { AdminAuthProvider } from "@vezlist/shared/context/AdminAuthContext.jsx";
import { ToastProvider } from "@vezlist/shared/context/ToastContext.jsx";
import { AdminThemeProvider } from "@vezlist/shared/context/AdminThemeContext.jsx";

// Admin features read and write the API. Demo localStorage data is not mounted.
export default function Providers({ children }) {
  return (
    <AdminThemeProvider>
      <AdminAuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AdminAuthProvider>
    </AdminThemeProvider>
  );
}
