import { LEDGER_SEED } from "../data/mock.js";

/**
 * The credit wallet, as pure functions.
 *
 * Credits were a number painted on the app bar — `credits = 100`, a default
 * argument, the same on every screen and unchanged by anything you did. This is
 * the model behind them: one balance, one ledger, and the two verbs that move
 * it. No React in here so the rules can be tested without rendering anything.
 *
 * The balance is money-shaped but it is not money: there is no payment
 * processor, so "buying" a pack credits the balance and records a row. What is
 * real is the arithmetic — a spend you cannot afford is refused rather than
 * quietly taking the balance negative, which is the bug this file exists to
 * make impossible.
 */

/** The ledger rides in a cookie shared by both origins, so it cannot grow forever. */
export const LEDGER_CAP = 12;

/**
 * A spend is labelled with the ad it promoted, and an ad title is whatever
 * somebody typed into the create sheet. Twelve rows of unbounded title, URL-
 * encoded (every brace and quote costs three bytes), is how you quietly cross
 * the ~4KB a cookie is allowed and lose the whole wallet on the next write —
 * silently, because setting an oversized cookie is not an error, it is a no-op.
 * Capped here, at the one place a label enters the ledger.
 */
export const MAX_LABEL = 64;

export const SEED_BALANCE = 100;

const clip = (label) =>
  label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;

export const seedWallet = () => ({
  balance: SEED_BALANCE,
  ledger: LEDGER_SEED.slice(0, LEDGER_CAP),
});

/**
 * A stored wallet, or a fresh one. Anything malformed — a hand-edited cookie,
 * a shape from an older build — is thrown away rather than half-trusted.
 */
export function normaliseWallet(value) {
  if (!value || typeof value !== "object") return seedWallet();
  const balance = Number(value.balance);
  return {
    balance: Number.isFinite(balance) && balance >= 0 ? Math.floor(balance) : 0,
    ledger: Array.isArray(value.ledger)
      ? value.ledger
          .filter(
            (row) =>
              row &&
              typeof row.id === "string" &&
              typeof row.label === "string" &&
              Number.isFinite(Number(row.delta)),
          )
          .slice(0, LEDGER_CAP)
      : [],
  };
}

/** Newest first, capped. */
function record(wallet, entry) {
  return {
    balance: wallet.balance,
    ledger: [entry, ...wallet.ledger].slice(0, LEDGER_CAP),
  };
}

/**
 * Buy a pack. Returns the next wallet, or the one it was given when the pack
 * makes no sense — a zero-credit pack is a data bug, not a free top-up.
 */
export function topUp(wallet, { credits, label, price, at = Date.now() }) {
  const amount = Math.floor(Number(credits));
  if (!Number.isFinite(amount) || amount <= 0) return wallet;

  const next = { ...wallet, balance: wallet.balance + amount };
  return record(next, {
    id: `tx-${at.toString(36)}`,
    label: clip(label ?? `${amount} credits`),
    delta: amount,
    price: Number.isFinite(Number(price)) ? Number(price) : undefined,
    at,
  });
}

/**
 * Spend on a promotion. Refused — the wallet comes back untouched — when the
 * balance will not cover it, so every caller can treat "same object back" as
 * "it did not happen" and say so.
 */
export function spend(wallet, { credits, label, at = Date.now() }) {
  const amount = Math.floor(Number(credits));
  if (!Number.isFinite(amount) || amount <= 0) return wallet;
  if (amount > wallet.balance) return wallet;

  const next = { ...wallet, balance: wallet.balance - amount };
  return record(next, {
    id: `tx-${at.toString(36)}`,
    label: clip(label ?? `${amount} credits`),
    delta: -amount,
    at,
  });
}

/** Can this wallet cover it? The question every Promote button asks first. */
export const affords = (wallet, credits) =>
  Number(credits) > 0 && wallet.balance >= Number(credits);
