import { creditPacks } from "../data/mock.js";
import {
  PAYBIS_DEFAULTS,
  apiOrigin,
  paybisEnvironment,
  quoteRequestBody,
} from "../lib/paybis.js";

/**
 * The half of the Paybis integration that holds the key.
 *
 * Both apps mount this at `POST /api/paybis/request`. It takes a pack id and
 * nothing else, prices it here, and hands back the `requestId` the browser
 * opens the widget on. Three things live on this side of the line and none of
 * them can move:
 *
 *   - **The API key.** A widget that could be opened from the browser alone
 *     could be opened by anyone, for any amount, against our merchant account.
 *   - **The price.** The pack arrives as an id, and the id is looked up in the
 *     same `creditPacks` the wallet screen renders. A `price` that travels
 *     through the browser is a price the browser can edit, and 800 credits for
 *     a dollar is exactly the shape that bug takes.
 *   - **The payout address.** It never reaches a client bundle, so it cannot
 *     be swapped by an extension for one belonging to somebody else.
 *
 * What is *not* here is the webhook, and that is deliberate rather than
 * forgotten. `POST /webhooks/paybis` is what settles a purchase — it is the
 * only signal that the money actually arrived, and in production it is the
 * only thing allowed to move a balance. It needs a durable place to write
 * that balance to, and this build keeps the wallet in a cookie on the buyer's
 * own machine. A webhook handler that verified a signature and then had
 * nowhere to put the result would be theatre. It lands with the database.
 */

/** Read the deploy's Paybis credentials. Absent is a state, not an error. */
export function paybisConfig(env = process.env) {
  const apiKey = env.PAYBIS_API_KEY?.trim();
  return {
    configured: Boolean(apiKey),
    apiKey,
    secretKey: env.PAYBIS_SECRET_KEY?.trim(),
    environment: paybisEnvironment(env.PAYBIS_ENVIRONMENT?.trim()),
    fiatCurrency:
      env.PAYBIS_FIAT_CURRENCY?.trim() || PAYBIS_DEFAULTS.fiatCurrency,
    cryptoCurrency:
      env.PAYBIS_CRYPTO_CURRENCY?.trim() || PAYBIS_DEFAULTS.cryptoCurrency,
    paymentMethod:
      env.PAYBIS_PAYMENT_METHOD?.trim() || PAYBIS_DEFAULTS.paymentMethod,
    // Behind a proxy the request URL is usually right; a deploy where it is
    // not (a preview host, a custom domain in front of the Worker) sets this
    // rather than sending the buyer back to an origin they never visited.
    returnOrigin: env.PAYBIS_RETURN_ORIGIN?.trim(),
  };
}

const hex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/**
 * `X-Signature` / `X-Timestamp`, when a secret is configured.
 *
 * Signed requests are opt-in here because the preimage is the one part of the
 * contract the public docs do not pin down — confirm it against the credential
 * pack Paybis issues with the key before setting `PAYBIS_SECRET_KEY`. With the
 * variable unset the call goes out bearer-authenticated only, which is what
 * the documented `curl` does when signing is not enabled on the account.
 */
async function authHeaders(body, config) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (!config.secretKey) return headers;

  const timestamp = Date.now().toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}${body}`),
  );
  return {
    ...headers,
    "X-Timestamp": timestamp,
    "X-Signature": hex(signature),
  };
}

/**
 * One call to Paybis. Throws with a status and a short reason; the caller
 * turns that into a response. The upstream body is logged, never returned —
 * a payment provider's error text is not something to render into a page.
 */
async function callPaybis(path, payload, config) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${apiOrigin(config.environment)}${path}`, {
    method: "POST",
    headers: await authHeaders(body, config),
    body,
    // A checkout that hangs is worse than one that fails: the buyer sits on a
    // spinner while the Worker holds an invocation open.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.error(
      "paybis: %s returned %d — %s",
      path,
      res.status,
      await res.text(),
    );
    const error = new Error(`paybis ${path} failed`);
    // 4xx from Paybis is our bug (a bad pack, a stale key); 5xx is theirs and
    // is worth retrying, and the two deserve different words on the screen.
    error.status = res.status >= 500 ? 502 : 500;
    throw error;
  }
  return res.json();
}

export async function POST(request) {
  const config = paybisConfig();

  // Not configured is a 200 with the truth in it, not a 500. Every deploy of
  // this repo that has no merchant account behind it lands here, and the
  // screen has something honest to say about that — see PaybisCheckout.
  if (!config.configured) {
    return Response.json({
      configured: false,
      environment: config.environment,
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const pack = creditPacks.find((p) => p.id === payload?.packId);
  if (!pack) {
    return Response.json({ error: "Unknown credit pack." }, { status: 400 });
  }

  const quote = quoteRequestBody(pack, config);
  if (!quote) {
    // The pack exists and is unsellable — a data bug, not a buyer's mistake.
    console.error("paybis: pack %s cannot be quoted", pack.id);
    return Response.json(
      { error: "That pack is unavailable." },
      { status: 500 },
    );
  }

  const origin = config.returnOrigin || new URL(request.url).origin;
  const returnUrl = (outcome) => `${origin}/paybis/return?outcome=${outcome}`;

  try {
    const { quoteId } = await callPaybis("/v2/quote", quote, config);
    const { requestId } = await callPaybis(
      "/request/v2",
      {
        quoteId,
        successReturnURL: returnUrl("success"),
        failureReturnURL: returnUrl("failure"),
      },
      config,
    );

    return Response.json({
      configured: true,
      environment: config.environment,
      requestId,
      packId: pack.id,
    });
  } catch (error) {
    return Response.json(
      { error: "Could not start checkout. Try again in a moment." },
      { status: error.status ?? 502 },
    );
  }
}
