import RequireAuth from "@vezlist/shared/components/RequireAuth.jsx";

/** Everything under /profile is the account area, and needs a session. */
export default function ProfileLayout({ children }) {
  return <RequireAuth>{children}</RequireAuth>;
}
