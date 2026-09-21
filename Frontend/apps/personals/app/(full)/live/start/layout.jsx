import RequireAuth from "@vezlist/shared/components/RequireAuth.jsx";

/**
 * Broadcasting is an account action, so the screen behind it is gated the way
 * every other one is.
 *
 * The create chooser already asks the capability question before it navigates
 * here, but a route is reachable by more than the control that links to it — a
 * typed URL, a bookmark, a shared link — and `/live/start` was the one create
 * entrance that answered a signed-out visitor with a viewfinder and a toast
 * instead of the login form. `RequireAuth` carries `?next=` so signing in lands
 * back here rather than on the board.
 *
 * `can("live.host")` is still asked inside `GoLive` itself: this says who you
 * are, that says what your account type may do, and a signed-in browsing
 * account needs to be told the second thing.
 */
export default function LiveStartLayout({ children }) {
  return <RequireAuth>{children}</RequireAuth>;
}
