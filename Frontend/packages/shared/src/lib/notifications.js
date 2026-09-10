const TYPES = new Set([
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "LISTING_REMOVED",
  "LISTING_EXPIRING",
  "LISTING_SAVED_AGGREGATE",
  "SUPPORT_REPLY",
  "PAYMENT_EVENT",
  "SECURITY_EVENT",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR = /^[1-9][0-9]{0,18}$/;
const invalid = () =>
  new TypeError("Could not read notifications. Please try again.");
const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT/.test(value) &&
  Number.isFinite(Date.parse(value));

export function notificationsPath(site, cursor) {
  const scope = String(site).toUpperCase();
  if (!["MARKETPLACE", "PERSONALS"].includes(scope)) throw invalid();
  if (cursor != null && (typeof cursor !== "string" || !CURSOR.test(cursor)))
    throw invalid();
  return `/me/notifications?site=${scope}&limit=24${cursor ? `&cursor=${cursor}` : ""}`;
}

export function notificationCount(data) {
  if (!data || !Number.isSafeInteger(data.count) || data.count < 0)
    throw invalid();
  return data.count;
}

export function notificationPage(data) {
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.items.length > 24 ||
    !(
      data.nextCursor === null ||
      (typeof data.nextCursor === "string" && CURSOR.test(data.nextCursor))
    )
  )
    throw invalid();
  const seen = new Set();
  const items = data.items.map((item) => {
    if (
      !item ||
      !UUID.test(item.id) ||
      seen.has(item.id) ||
      !TYPES.has(item.type) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 200 ||
      typeof item.message !== "string" ||
      item.message.length > 2000 ||
      typeof item.href !== "string" ||
      !/^\/[a-zA-Z0-9/_-]*$/.test(item.href) ||
      item.href.startsWith("//") ||
      !date(item.createdAt) ||
      !(item.readAt === null || date(item.readAt))
    )
      throw invalid();
    seen.add(item.id);
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      href: item.href,
      createdAt: item.createdAt,
      readAt: item.readAt,
    };
  });
  return { items, nextCursor: data.nextCursor };
}

// One external query cache per authenticated session and site. Nothing is persisted
// in browser storage. Generations invalidate responses crossing mutations/logout.
export function createNotificationsQuery(request, site, authenticated = true) {
  const base = notificationsPath(site).split("?")[0];
  const scope = `?site=${String(site).toUpperCase()}`;
  let snapshot = {
    items: [],
    nextCursor: null,
    loaded: false,
    loading: false,
    loadingMore: false,
    count: null,
    error: null,
    countError: null,
    mutationError: null,
    pending: null,
  };
  let epoch = 0;
  let active = true;
  const inflight = new Map();
  const listeners = new Set();
  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((fn) => fn());
  };
  const valid = (version) => active && version === epoch;
  const fail = (error, patch) => {
    if ([401, 403].includes(error.status)) {
      active = false;
      epoch += 1;
      inflight.clear();
      publish({
        ...patch,
        items: [],
        nextCursor: null,
        count: null,
        loaded: false,
        loading: false,
        loadingMore: false,
        pending: null,
        error,
        sessionExpired: true,
      });
    } else publish(patch);
  };
  const run = (key, work) => {
    if (!active || !authenticated) return Promise.resolve();
    if (inflight.has(key)) return inflight.get(key);
    const version = epoch;
    const promise = Promise.resolve()
      .then(() => (valid(version) ? work(version) : undefined))
      .finally(() => {
        if (inflight.get(key) === promise) inflight.delete(key);
      });
    inflight.set(key, promise);
    return promise;
  };
  const query = {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => snapshot,
    activate() {
      active = true;
    },
    dispose() {
      active = false;
      epoch += 1;
      inflight.clear();
    },
    count() {
      if (snapshot.pending) return Promise.resolve();
      return run("count", async (version) => {
        try {
          const count = notificationCount(
            await request(`${base}/unread-count${scope}`),
          );
          if (valid(version)) publish({ count, countError: null });
        } catch (error) {
          if (valid(version)) fail(error, { countError: error });
        }
      });
    },
    load(more = false) {
      if (
        snapshot.pending ||
        (more && (!snapshot.nextCursor || snapshot.loading))
      )
        return Promise.resolve();
      return run("feed", async (version) => {
        publish({ loading: !more, loadingMore: more, error: null });
        try {
          const page = notificationPage(
            await request(
              notificationsPath(site, more ? snapshot.nextCursor : null),
            ),
          );
          if (!valid(version)) return;
          const items = more
            ? [
                ...new Map(
                  [...snapshot.items, ...page.items].map((item) => [
                    item.id,
                    item,
                  ]),
                ).values(),
              ]
            : page.items;
          publish({
            ...page,
            items,
            loaded: true,
            loading: false,
            loadingMore: false,
          });
        } catch (error) {
          if (valid(version))
            fail(error, { error, loading: false, loadingMore: false });
        }
      });
    },
    refresh() {
      return Promise.all([
        query.count(),
        snapshot.loaded ? query.load() : Promise.resolve(),
      ]);
    },
    markRead(id = null) {
      if (id !== null && !UUID.test(id)) return Promise.reject(invalid());
      if (!active || !authenticated) return Promise.resolve();
      if (snapshot.pending)
        return inflight.get("mutation") ?? Promise.resolve();
      epoch += 1;
      inflight.clear();
      publish({
        pending: id ?? "all",
        mutationError: null,
        loading: false,
        loadingMore: false,
      });
      return run("mutation", async (version) => {
        try {
          const count = notificationCount(
            await request(`${base}/${id ? `${id}/read` : "read-all"}${scope}`, {
              method: "POST",
            }),
          );
          if (!valid(version)) return;
          // Only confirmed writes change read state. Failed writes never hide alerts.
          const readAt = new Date().toISOString();
          publish({
            count,
            countError: null,
            pending: null,
            items: snapshot.items.map((item) =>
              !id || item.id === id
                ? { ...item, readAt: item.readAt ?? readAt }
                : item,
            ),
          });
          await query.refresh();
        } catch (error) {
          if (valid(version)) {
            fail(error, { pending: null, mutationError: error });
            await query.refresh();
          }
        }
      });
    },
  };
  return query;
}
