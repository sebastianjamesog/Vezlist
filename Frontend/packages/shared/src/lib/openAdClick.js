/** Preserve normal links for modified clicks, new tabs, and direct ad URLs. */
export function openAdClick(event, open) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  open();
}
