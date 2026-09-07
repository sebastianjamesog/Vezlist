/** Mask a phone number or email the way the ad detail screen shows it. */
export function maskContact(value, kind) {
  if (!value) return "";
  if (kind === "email") {
    const [, domain = ""] = value.split("@");
    return `...@${domain}`;
  }
  return `...${value.slice(-5)}`;
}

/** "5 hours Ago" style relative label from a millisecond offset into the past. */
export function timeAgo(msAgo) {
  const units = [
    ["minute", 60_000],
    ["hour", 3_600_000],
    ["day", 86_400_000],
  ];
  let label = "Just now";
  for (const [name, size] of units) {
    const n = Math.floor(msAgo / size);
    if (n >= 1) label = `${n} ${name}${n > 1 ? "s" : ""} Ago`;
  }
  return label;
}
