// Run with: node --test src/lib/paybis.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  PAYBIS_HOSTS,
  RETURN_MESSAGE,
  apiOrigin,
  ledgerLabel,
  normaliseStatus,
  paybisEnvironment,
  quoteRequestBody,
  readReturnMessage,
  widgetOrigin,
  widgetScriptUrl,
  widgetUrl,
} from "./paybis.js";

const SELF = "https://vezlist.example";
const pack = { id: "cp2", credits: 350, price: 25 };

test("anything but the literal 'production' is sandbox", () => {
  assert.equal(paybisEnvironment("production"), "production");
  for (const value of ["Production", "prod", "sandbox", "", null, undefined]) {
    assert.equal(paybisEnvironment(value), "sandbox", String(value));
  }
});

test("each environment has its own widget and API hosts", () => {
  assert.equal(widgetOrigin("production"), PAYBIS_HOSTS.production.widget);
  assert.equal(apiOrigin("production"), PAYBIS_HOSTS.production.api);
  assert.equal(widgetOrigin("sandbox"), PAYBIS_HOSTS.sandbox.widget);
  assert.match(
    widgetScriptUrl("sandbox"),
    /^https:\/\/widget\.sandbox\.paybis\.com\//,
  );
  // Never the same host twice: the sandbox one cannot move real money.
  assert.notEqual(PAYBIS_HOSTS.sandbox.widget, PAYBIS_HOSTS.production.widget);
});

test("the widget URL carries the request id and encodes the return URLs", () => {
  const url = widgetUrl({
    environment: "production",
    requestId: "a122b998-15a4",
    successReturnURL: "https://vezlist.example/paybis/return?outcome=success",
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, PAYBIS_HOSTS.production.widget);
  assert.equal(parsed.searchParams.get("requestId"), "a122b998-15a4");
  assert.equal(
    parsed.searchParams.get("successReturnURL"),
    "https://vezlist.example/paybis/return?outcome=success",
  );
  // The query string the widget is handed must be escaped, not nested raw.
  assert.ok(!url.includes("return?outcome"));
});

test("no request id is no URL — an unparameterised widget is a dead end", () => {
  for (const requestId of [undefined, null, "", "   ", 42]) {
    assert.equal(widgetUrl({ requestId }), null, String(requestId));
  }
});

test("a pack quotes as the fiat the buyer spends, not the crypto they get", () => {
  const body = quoteRequestBody(pack);
  assert.equal(body.currencyCodeFrom, "USD");
  assert.equal(body.currencyCodeTo, "USDT-TRC20");
  assert.equal(body.amount, "25.00");
  assert.equal(body.directionChange, "from");
  assert.equal(body.isReceivedAmount, false);
  assert.equal(body.paymentMethod, "credit_card");

  // The settlement asset is a deploy decision, not a hard-coded one.
  const eur = quoteRequestBody(pack, {
    fiatCurrency: "EUR",
    cryptoCurrency: "USDT-ERC20",
  });
  assert.equal(eur.currencyCodeFrom, "EUR");
  assert.equal(eur.currencyCodeTo, "USDT-ERC20");
});

test("a pack that makes no sense opens no checkout", () => {
  for (const bad of [
    null,
    {},
    { credits: 350, price: 0 },
    { credits: 350, price: -25 },
    { credits: 0, price: 25 },
    { credits: "many", price: 25 },
    { credits: 350, price: "free" },
  ]) {
    assert.equal(quoteRequestBody(bad), null, JSON.stringify(bad));
  }
});

test("the three status dialects collapse to four outcomes", () => {
  for (const raw of ["completed", "SUCCESS", "transaction.completed", "paid"]) {
    assert.equal(normaliseStatus(raw), "completed", raw);
  }
  for (const raw of ["failed", "transaction.failed", "declined", "expired"]) {
    assert.equal(normaliseStatus(raw), "failed", raw);
  }
  for (const raw of ["cancelled", "canceled", "closed"]) {
    assert.equal(normaliseStatus(raw), "cancelled", raw);
  }
});

test("a status nobody has seen before is pending, never completed", () => {
  for (const raw of [
    "",
    null,
    undefined,
    {},
    "completed-ish",
    "kyc.completed",
  ]) {
    assert.equal(normaliseStatus(raw), "pending", String(raw));
  }
});

test("only the widget host and our own return page are believed", () => {
  const message = { status: "completed", transactionId: "txn_12345" };
  const opts = { selfOrigin: SELF, environment: "production" };

  // A frame on some other origin claiming a payment succeeded is ignored —
  // this is the whole reason the origin is checked before the payload is read.
  for (const origin of [
    "https://evil.example",
    "https://widget.paybis.com.evil.example",
    PAYBIS_HOSTS.sandbox.widget, // right vendor, wrong environment
    "null",
  ]) {
    assert.equal(
      readReturnMessage({ origin, data: message }, opts),
      null,
      origin,
    );
  }

  const fromPaybis = readReturnMessage(
    { origin: PAYBIS_HOSTS.production.widget, data: message },
    opts,
  );
  assert.equal(fromPaybis.status, "completed");
  assert.equal(fromPaybis.transactionId, "txn_12345");
  assert.equal(fromPaybis.trusted, false);
});

test("our own origin needs the marker — it hosts every other frame too", () => {
  const opts = { selfOrigin: SELF, environment: "production" };
  assert.equal(
    readReturnMessage({ origin: SELF, data: { status: "completed" } }, opts),
    null,
  );
  const tagged = readReturnMessage(
    {
      origin: SELF,
      data: {
        source: RETURN_MESSAGE,
        status: "failure",
        transaction_id: "txn_9",
      },
    },
    opts,
  );
  assert.equal(tagged.status, "failed");
  assert.equal(tagged.transactionId, "txn_9");
  assert.equal(tagged.trusted, true);
});

test("a message that says nothing terminal moves nothing", () => {
  const opts = { selfOrigin: SELF, environment: "production" };
  for (const data of [
    null,
    "completed",
    { source: RETURN_MESSAGE },
    { source: RETURN_MESSAGE, status: "pending" },
    { source: RETURN_MESSAGE, status: "resize" },
  ]) {
    assert.equal(readReturnMessage({ origin: SELF, data }, opts), null);
  }
});

test("the ledger label names the pack and the receipt behind it", () => {
  assert.equal(
    ledgerLabel(pack, "txn_1234567890"),
    "350 credits · Paybis txn_1234",
  );
  // No reference yet is still a legible row, not "undefined".
  assert.equal(ledgerLabel(pack, null), "350 credits · Paybis");
  // Short enough that wallet.js never has to clip it — see MAX_LABEL.
  assert.ok(ledgerLabel(pack, "txn_1234567890").length <= 64);
});
