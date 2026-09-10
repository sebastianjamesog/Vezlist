export const REPORT_REASONS = [
  { value: "SPAM", label: "Spam or duplicate ad" },
  { value: "FRAUD", label: "Scam or fraud" },
  { value: "PROHIBITED", label: "Prohibited content" },
  { value: "SAFETY", label: "Safety concern" },
  { value: "OTHER", label: "Something else" },
];

function scope(site) {
  const value = String(site).toUpperCase();
  if (!["MARKETPLACE", "PERSONALS"].includes(value))
    throw new TypeError("Invalid site.");
  return value;
}

export function moderationPath(listingId, site) {
  if (!listingId) throw new TypeError("A listing is required.");
  return `/me/listings/${encodeURIComponent(listingId)}/moderation?site=${scope(site)}`;
}

export function ownerModeration(data, listingId) {
  if (
    !data ||
    data.listingId !== listingId ||
    typeof data.status !== "string" ||
    typeof data.appealAllowed !== "boolean" ||
    (data.publicReason != null && typeof data.publicReason !== "string")
  ) {
    throw new TypeError(
      "Could not read the moderation details. Please try again.",
    );
  }
  return {
    listingId: data.listingId,
    status: data.status,
    publicReason: data.publicReason ?? null,
    appealAllowed:
      ["REJECTED", "REMOVED"].includes(data.status) && data.appealAllowed,
  };
}

function text(value, maximum, required) {
  const result = String(value ?? "").trim();
  if ((required && !result) || result.length > maximum) {
    throw new TypeError(
      required
        ? `Enter a message of 1 to ${maximum} characters.`
        : `Use at most ${maximum} characters.`,
    );
  }
  return result;
}

export async function reportListing(request, listingId, site, reason, details) {
  if (!listingId) throw new TypeError("A listing is required.");
  if (!REPORT_REASONS.some((entry) => entry.value === reason))
    throw new TypeError("Choose a report reason.");
  const result = await request(
    `/listings/${encodeURIComponent(listingId)}/reports`,
    {
      method: "POST",
      body: {
        site: scope(site),
        reason,
        details: text(details, 1000, false) || null,
      },
    },
  );
  return submission(result);
}

export async function appealListing(request, listingId, site, message) {
  if (!listingId) throw new TypeError("A listing is required.");
  const result = await request(
    `/me/listings/${encodeURIComponent(listingId)}/moderation/appeals`,
    {
      method: "POST",
      body: { site: scope(site), message: text(message, 2000, true) },
    },
  );
  return submission(result);
}

function submission(result) {
  if (!result || typeof result.id !== "string" || !result.id) {
    throw new TypeError(
      "The server did not confirm your submission. Please refresh before trying again.",
    );
  }
  return { id: result.id };
}

// Review data is cached only for this mounted owner card, never across sessions.
export function createModerationQuery(request, listingId, site) {
  let snapshot = { state: "idle", data: null, error: null };
  let pending = null;
  const listeners = new Set();
  function publish(next) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    load(force = false) {
      if (pending) return pending;
      if (!force && snapshot.state === "success")
        return Promise.resolve(snapshot.data);
      publish({ state: "loading", data: null, error: null });
      pending = Promise.resolve()
        .then(() => request(moderationPath(listingId, site)))
        .then((result) => {
          const data = ownerModeration(result, listingId);
          publish({ state: "success", data, error: null });
          return data;
        })
        .catch((error) => {
          publish({ state: "error", data: null, error });
          throw error;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
