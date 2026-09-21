import AppLayout from "@vezlist/shared/components/layout/AppLayout.jsx";

export default function ShellLayout({ children }) {
  // Category crosses to the marketplace launcher and Nearby takes the support
  // slot; support itself is a row in the profile menu.
  return <AppLayout navPreset="personals">{children}</AppLayout>;
}
