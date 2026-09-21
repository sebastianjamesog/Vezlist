import AppLayout from "@vezlist/shared/components/layout/AppLayout.jsx";

export default function ShellLayout({ children }) {
  // The Home tab goes to the feed rather than back to the launcher — the
  // launcher is where you already are when the app opens.
  return <AppLayout navPreset="marketplace">{children}</AppLayout>;
}
