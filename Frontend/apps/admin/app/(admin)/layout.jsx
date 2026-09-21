import { Suspense } from "react";
import AdminLayout from "@vezlist/shared/components/admin/AdminLayout.jsx";

/**
 * Every route except `/login` sits inside this group, so the rail, the top bar
 * and the sign-in guard are declared once.
 *
 * The top bar's site switcher writes to `?site=`, which makes this layout a
 * reader of the query string — hence the boundary, the same reason `browse/`
 * and `nearby/` are split in two files on the public sites.
 */
export default function Layout({ children }) {
  return (
    /**
     * The fallback paints the canvas and nothing else, deliberately. This
     * boundary covers the chrome itself, so a skeleton here would draw a rail
     * and a top bar only to swap them for the real ones a frame later; the
     * per-route `loading.jsx` inside this layout is where a shaped skeleton
     * belongs. All this needs to do is keep the console from flashing white.
     */
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <AdminLayout>{children}</AdminLayout>
    </Suspense>
  );
}
