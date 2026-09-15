/**
 * Paybis, as pure functions.
 *
 * Credits are bought with money, and until now the money was a sentence in a
 * modal — "nothing is charged, there is no payment processor behind this
 * demo". Paybis is the processor. It is a fiat-to-crypto on-ramp: the buyer
 * pays with a card or a bank transfer, Paybis does the KYC and the settlement,
 * and the crypto lands in *our* payout address. The credit pack is what we
 * hand back once it has.
 *
 * The integration has two halves and they are split on the secret. The half
 * that holds the API key creates a transaction request server-side and gets a
 * `requestId` (see `src/server/paybisRequest.js`); the half in the browser does
 * nothing but open a widget on that id. Nothing in this file knows the key,
 * which is why all of it can be imported from either side.
 *
 * No React and no `fetch` in here either — the same reason `wallet.js` has
 * none. What is worth testing about a payment integration is the arithmetic
 * and the trust boundary, and neither needs a DOM to be wrong in.
 */

/**
 * The two Paybis environments, and the two hosts each one has.
 *
 * `widget` is what the browser loads and — more importantly — the only origin
 * a postMessage claiming a payment succeeded is allowed to come from.
 * `widget-api` is the REST host the server half talks to.
 */
export const PAYBIS_HOSTS = {
  sandbox: {
    widget: "https://widget.sandbox.paybis.com",
    api: "https://widget-api.sandbox.paybis.com",
  },
  production: {
    widget: "https://widget.paybis.com",
    api: "https://widget-api.paybis.com",
  },
};

/**
 * What a pack costs in, and what Paybis settles it into.
 *
 * The crypto side carries its network — `USDT-TRC20` is a different asset to
 * `USDT-ERC20` as far as a payout address is concerned, and picking the wrong
 * one is how a settlement lands somewhere nobody can spend it from.
 */
export const PAYBIS_DEFAULTS = {
  fiatCurrency: "USD",
  cryptoCurrency: "USDT-TRC20",
  paymentMethod: "credit_card",
};

/**
 * Sandbox unless something explicitly says production.
 *
 * The fallback direction is the whole point: a typo in a Worker variable
 * (`Production`, `prod`, an empty string) sends the flow somewhere that cannot
 * take real money, rather than somewhere that can. Getting this backwards
 * charges a real card during a smoke test.
 */
export function paybisEnvironment(value) {
  return value === "production" ? "production" : "sandbox";
}

export const widgetOrigin = (environment) =>
  PAYBIS_HOSTS[paybisEnvironment(environment)].widget;

export const apiOrigin = (environment) =>
  PAYBIS_HOSTS[paybisEnvironment(environment)].api;

/** The Web SDK bundle. Loading it defines `window.PartnerExchangeWidget`. */
export const widgetScriptUrl = (environment) =>
  `${widgetOrigin(environment)}/partner-exchange-widget.js`;

/**
 * The widget as a plain URL.
 *
 * The SDK is the nice path — it embeds in an element and keeps the buyer on
 * the page. This is the path for when the SDK does not load at all: a blocked
 * third-party script, a hardened browser, an extension. A link is not as nice
 * and it still completes the purchase, which beats a spinner that never ends.
 */
export function widgetUrl({
  environment,
  requestId,
  successReturnURL,
  failureReturnURL,
} = {}) {
  const id = typeof requestId === "string" ? requestId.trim() : "";
  if (!id) return null;

  const url = new URL(widgetOrigin(environment));
  url.searchParams.set("requestId", id);
  if (successReturnURL)
    url.searchParams.set("successReturnURL", successReturnURL);
  if (failureReturnURL)
    url.searchParams.set("failureReturnURL", failureReturnURL);
  return url.toString();
}

/**
 * A credit pack, as the body of `POST /v2/quote`.
 *
 * Paybis prices before it transacts: a quote fixes the rate and the fees for a
 * few minutes and hands back a `quoteId`, and only then does `POST /request/v2`
 * turn that into the `requestId` the widget opens on. Two calls, because the
 * buyer is entitled to see what $25 buys before a checkout starts.
 *
 * `directionChange: "from"` and `isReceivedAmount: false` are the pair that
 * says "the amount below is the fiat the buyer spends" — a credit pack is
 * priced in dollars, not in however much USDT that turns out to be.
 *
 * Returns `null` for a pack that makes no sense, on the same contract `topUp`
 * uses for the same reason: a zero-dollar or zero-credit row is a data bug,
 * and the fix is to sell nothing rather than to open a checkout for $0 and
 * have Paybis reject it three screens later.
 *
 * Note what is *not* a parameter: the amount is read off the pack, and the
 * pack is looked up on the server from the same `creditPacks` the screen
 * renders. A price that arrives from the browser is a price the browser can
 * edit, and 800 credits for a dollar is exactly the shape that bug takes.
 */
export function quoteRequestBody(
  pack,
  {
    fiatCurrency = PAYBIS_DEFAULTS.fiatCurrency,
    cryptoCurrency = PAYBIS_DEFAULTS.cryptoCurrency,
    paymentMethod = PAYBIS_DEFAULTS.paymentMethod,
  } = {},
) {
  const price = Number(pack?.price);
  const credits = Math.floor(Number(pack?.credits));
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(credits) || credits <= 0) return null;

  return {
    currencyCodeFrom: fiatCurrency,
    currencyCodeTo: cryptoCurrency,
    // A string, the way the documented call sends it — a float that renders as
    // `25.000000000000004` is not a price anyone wants to reconcile.
    amount: price.toFixed(2),
    directionChange: "from",
    paymentMethod,
    isReceivedAmount: false,
  };
}

/**
 * Paybis says "completed" in more than one dialect — the REST status, the
 * webhook `event_type` and whatever the widget posts up are three vocabularies
 * for four outcomes. Everything unrecognised is `pending`, deliberately:
 * a status we have never seen is not a reason to hand out credits.
 */
export function normaliseStatus(raw) {
  const value = String(raw ?? "")
    .toLowerCase()
    .replace(/^transaction[._]/, "");

  if (/^(completed|complete|success|successful|approved|paid)$/.test(value)) {
    return "completed";
  }
  if (/^(failed|failure|error|rejected|declined|expired)$/.test(value)) {
    return "failed";
  }
  if (/^(cancelled|canceled|closed|abandoned)$/.test(value)) {
    return "cancelled";
  }
  return "pending";
}

/** The marker our own return page stamps on the message it posts up. */
export const RETURN_MESSAGE = "vezlist:paybis-return";

/**
 * Read a `message` event as a payment outcome, or refuse to.
 *
 * This is the trust boundary, so it is the part with tests. A `postMessage`
 * can be sent by any frame on the page; a listener that reads `data.status`
 * and credits the balance is a listener that any embedded ad can top up a
 * wallet with. Two origins are allowed and no others:
 *
 *   - our own, carrying `RETURN_MESSAGE` — that is the return page Paybis
 *     redirected the widget frame to, telling its opener how it went;
 *   - the Paybis widget host for the environment in play.
 *
 * Even then the answer is advisory. It moves the screen on; the money is not
 * settled until the webhook says so (see `src/server/paybisRequest.js`).
 */
export function readReturnMessage(event, { selfOrigin, environment } = {}) {
  const data = event?.data;
  if (!data || typeof data !== "object") return null;

  const origin = event.origin;
  const fromUs = Boolean(selfOrigin) && origin === selfOrigin;
  const fromPaybis = origin === widgetOrigin(environment);
  if (!fromUs && !fromPaybis) return null;
  // Our own origin is also every other frame we host, so the marker is what
  // separates the return page from anything else on it.
  if (fromUs && data.source !== RETURN_MESSAGE) return null;

  const status = normaliseStatus(
    data.status ?? data.event ?? data.type ?? data.event_type,
  );
  if (status === "pending") return null;

  const transactionId =
    typeof data.transactionId === "string"
      ? data.transactionId
      : typeof data.transaction_id === "string"
        ? data.transaction_id
        : null;

  return { status, transactionId, trusted: fromUs };
}

/**
 * The ledger label for a settled pack. Short on purpose — the wallet clips at
 * `MAX_LABEL` because twelve rows share one cookie, and a truncated Paybis
 * reference is a reference you cannot look up.
 */
export function ledgerLabel(pack, transactionId) {
  const ref =
    typeof transactionId === "string" ? transactionId.slice(0, 8) : "";
  return ref
    ? `${pack.credits} credits · Paybis ${ref}`
    : `${pack.credits} credits · Paybis`;
}
