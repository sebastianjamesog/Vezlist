import { Suspense } from "react";
import PaybisReturn from "@vezlist/shared/pages/PaybisReturn.jsx";

// Paybis redirects the checkout frame here when it finishes. No shell: this
// renders inside the widget's iframe, and a bottom nav inside an iframe inside
// a modal is three chrome layers deep.
export const metadata = {
  title: "Payment",
  // Nothing here is worth indexing, and the URL carries a transaction id.
  robots: { index: false, follow: false },
};

// The outcome arrives as ?outcome=, read on the client, so the prerendered
// shell needs a boundary to stream it into — same reason /login has one.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PaybisReturn />
    </Suspense>
  );
}
